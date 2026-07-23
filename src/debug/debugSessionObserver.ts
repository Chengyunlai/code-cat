import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { SessionStore } from "../core/sessionStore";
import {
  DapStackFrame,
  DapVariable,
  DebugPause,
  StackFrameSnapshot,
  VariableSnapshot,
} from "../domain/model";

interface DapEvent {
  readonly type?: unknown;
  readonly event?: unknown;
  readonly body?: unknown;
}

interface StoppedEventBody {
  readonly reason?: unknown;
  readonly description?: unknown;
  readonly threadId?: unknown;
}

interface DapScope {
  readonly name?: unknown;
  readonly variablesReference?: unknown;
  readonly expensive?: unknown;
}

const SENSITIVE_VARIABLE =
  /(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key)/iu;

export class DebugSessionObserver implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly captureVersions = new Map<string, number>();
  private readonly trackedSessions = new Set<string>();

  public constructor(private readonly store: SessionStore) {
    const factory: vscode.DebugAdapterTrackerFactory = {
      createDebugAdapterTracker: (session) => {
        this.trackedSessions.add(session.id);
        if (!this.store.snapshot().debugSessionId) {
          this.store.beginDebugSession(session.id);
        }
        return {
          onDidSendMessage: (message: unknown) => this.observeAdapterMessage(session, message),
        };
      },
    };
    this.disposables.push(
      vscode.debug.registerDebugAdapterTrackerFactory("python", factory),
      vscode.debug.registerDebugAdapterTrackerFactory("debugpy", factory),
      vscode.debug.onDidTerminateDebugSession((session) => {
        this.captureVersions.delete(session.id);
        this.trackedSessions.delete(session.id);
        this.store.endDebugSession(session.id);
      }),
    );
  }

  public useSession(sessionId: string): boolean {
    if (!this.trackedSessions.has(sessionId)) {
      return false;
    }
    this.store.beginDebugSession(sessionId);
    return true;
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private observeAdapterMessage(session: vscode.DebugSession, message: unknown): void {
    if (this.store.snapshot().debugSessionId !== session.id || !isStoppedEvent(message)) {
      return;
    }

    const version = (this.captureVersions.get(session.id) ?? 0) + 1;
    this.captureVersions.set(session.id, version);
    void this.capturePause(session, message.body, version).catch((error: unknown) => {
      const details = error instanceof Error ? error.message : String(error);
      console.warn(`Code Cat could not capture the debug pause: ${details}`);
    });
  }

  private async capturePause(
    session: vscode.DebugSession,
    body: StoppedEventBody,
    version: number,
  ): Promise<void> {
    const threadId = await resolveThreadId(session, body.threadId);
    if (threadId === undefined) {
      return;
    }

    const maxFrames = vscode.workspace
      .getConfiguration("codeCat")
      .get<number>("maxStackFrames", 30);
    const stackResponse = (await session.customRequest("stackTrace", {
      threadId,
      startFrame: 0,
      levels: maxFrames,
    })) as { readonly stackFrames?: unknown };
    const frames = parseFrames(stackResponse.stackFrames);
    const variables = frames[0]
      ? await captureTopFrameVariables(session, frames[0].id)
      : [];

    if (this.captureVersions.get(session.id) !== version) {
      return;
    }

    const pause: DebugPause = {
      id: randomUUID(),
      sessionId: session.id,
      reason: typeof body.reason === "string" ? body.reason : "paused",
      description: typeof body.description === "string" ? body.description : undefined,
      threadId,
      recordedAt: new Date().toISOString(),
      frames,
      variables,
    };
    this.store.recordPause(pause);
  }
}

function isStoppedEvent(message: unknown): message is DapEvent & { body: StoppedEventBody } {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as DapEvent;
  return candidate.type === "event" && candidate.event === "stopped" && isObject(candidate.body);
}

async function resolveThreadId(
  session: vscode.DebugSession,
  candidate: unknown,
): Promise<number | undefined> {
  if (typeof candidate === "number") {
    return candidate;
  }
  const response = (await session.customRequest("threads")) as {
    readonly threads?: readonly { readonly id?: unknown }[];
  };
  const firstThread = response.threads?.find((thread) => typeof thread.id === "number");
  return typeof firstThread?.id === "number" ? firstThread.id : undefined;
}

function parseFrames(value: unknown): readonly StackFrameSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate: unknown) => {
    if (!isDapStackFrame(candidate)) {
      return [];
    }
    return [
      {
        id: candidate.id,
        name: candidate.name,
        location: candidate.source?.path
          ? {
              path: candidate.source.path,
              line: Math.max(1, candidate.line),
              column: Math.max(1, candidate.column),
            }
          : undefined,
      },
    ];
  });
}

async function captureTopFrameVariables(
  session: vscode.DebugSession,
  frameId: number,
): Promise<readonly VariableSnapshot[]> {
  const maxVariables = vscode.workspace
    .getConfiguration("codeCat")
    .get<number>("maxVariables", 40);
  const scopesResponse = (await session.customRequest("scopes", { frameId })) as {
    readonly scopes?: unknown;
  };
  const scopes = Array.isArray(scopesResponse.scopes)
    ? scopesResponse.scopes.filter(isDapScope)
    : [];
  const preferredScopes = [...scopes].sort((left, right) => {
    const leftScore = left.name === "Locals" ? 0 : left.expensive ? 2 : 1;
    const rightScore = right.name === "Locals" ? 0 : right.expensive ? 2 : 1;
    return leftScore - rightScore;
  });

  const snapshots: VariableSnapshot[] = [];
  for (const scope of preferredScopes) {
    if (snapshots.length >= maxVariables) {
      break;
    }
    const response = (await session.customRequest("variables", {
      variablesReference: scope.variablesReference,
      start: 0,
      count: maxVariables - snapshots.length,
    })) as { readonly variables?: unknown };
    if (!Array.isArray(response.variables)) {
      continue;
    }
    for (const variable of response.variables) {
      if (snapshots.length >= maxVariables) {
        break;
      }
      if (isDapVariable(variable)) {
        snapshots.push({
          name: variable.name,
          value: SENSITIVE_VARIABLE.test(variable.name)
            ? "<redacted by Code Cat>"
            : variable.value.slice(0, 500),
          type: variable.type,
        });
      }
    }
  }
  return snapshots;
}

function isDapStackFrame(value: unknown): value is DapStackFrame {
  if (!isObject(value)) {
    return false;
  }
  return (
    typeof value.id === "number" &&
    typeof value.name === "string" &&
    typeof value.line === "number" &&
    typeof value.column === "number"
  );
}

function isDapScope(value: unknown): value is DapScope & {
  readonly name: string;
  readonly variablesReference: number;
} {
  return (
    isObject(value) &&
    typeof value.name === "string" &&
    typeof value.variablesReference === "number"
  );
}

function isDapVariable(value: unknown): value is DapVariable {
  return isObject(value) && typeof value.name === "string" && typeof value.value === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
