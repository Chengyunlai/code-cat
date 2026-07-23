import * as path from "node:path";
import * as vscode from "vscode";
import { normalizePath } from "../core/locations";
import { SessionStore } from "../core/sessionStore";
import { hasSourceBreakpoint } from "../debug/breakpoints";
import { RouteNode, SourceLocation, StackFrameSnapshot } from "../domain/model";
import { createRuntimeMapHtml } from "./runtimeMapHtml";

export interface RuntimeMapActions {
  askQuestion(question: string): Promise<void>;
  startGuidedDebug(question?: string): Promise<void>;
  explainPause(question?: string): Promise<void>;
  revealLocation(location: SourceLocation, frameId?: number): Promise<void>;
  toggleBreakpoint(location: SourceLocation): void;
  runDebugCommand(command: "continue" | "stepInto" | "stepOver"): Promise<void>;
  configureModelProvider(): Promise<void>;
  modelProviderStatus(): { readonly label: string; readonly detail?: string };
}

interface WebviewMessage {
  readonly type?: unknown;
  readonly error?: unknown;
  readonly question?: unknown;
  readonly nodeId?: unknown;
  readonly pauseId?: unknown;
  readonly frameId?: unknown;
  readonly command?: unknown;
  readonly version?: unknown;
  readonly chatMessageCount?: unknown;
}

export class RuntimeMapView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private stateVersion = 0;
  private lastSentFrameCount = 0;
  private lastAcknowledgedFrameCount = 0;
  private readyCount = 0;
  private renderedStateCount = 0;
  private lastReceivedVersion: number | undefined;
  private scriptError: string | undefined;
  private renderedChatMessageCount = 0;
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: SessionStore,
    private readonly actions: RuntimeMapActions,
  ) {
    this.disposables.push(
      store.onDidChange(() => this.postState()),
      vscode.debug.onDidChangeBreakpoints(() => this.postState()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.postState()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("codeCat.ai")) {
          this.postState();
        }
      }),
    );
  }

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    view.webview.html = createRuntimeMapHtml(view.webview);
    this.disposables.push(
      view.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message)),
      view.onDidDispose(() => {
        if (this.view === view) {
          this.view = undefined;
          this.lastSentFrameCount = 0;
          this.lastAcknowledgedFrameCount = 0;
          this.renderedChatMessageCount = 0;
        }
      }),
    );
    this.postState();
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  public smokeDiagnostics(): {
    readonly resolved: boolean;
    readonly visible: boolean;
    readonly frameCount: number;
    readonly sentFrameCount: number;
    readonly stateVersion: number;
    readonly readyCount: number;
    readonly renderedStateCount: number;
    readonly lastReceivedVersion: number | undefined;
    readonly scriptError: string | undefined;
    readonly renderedChatMessageCount: number;
  } {
    return {
      resolved: this.view !== undefined,
      visible: this.view?.visible ?? false,
      frameCount: this.lastAcknowledgedFrameCount,
      sentFrameCount: this.lastSentFrameCount,
      stateVersion: this.stateVersion,
      readyCount: this.readyCount,
      renderedStateCount: this.renderedStateCount,
      lastReceivedVersion: this.lastReceivedVersion,
      scriptError: this.scriptError,
      renderedChatMessageCount: this.renderedChatMessageCount,
    };
  }

  public showForSmoke(): boolean {
    if (!this.view) {
      return false;
    }
    this.view.show(true);
    return this.view.visible;
  }

  public refresh(): void {
    this.postState();
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    const state = this.store.snapshot();
    const currentPause = this.store.selectedPause();
    const routeNodes = state.route?.nodes ?? [];
    const selectedFrame =
      currentPause?.frames.find((frame) => frame.id === state.selectedFrameId) ??
      currentPause?.frames[0];
    const focusedNodeId = selectedFrame
      ? closestRouteNodeId(routeNodes, selectedFrame)
      : undefined;
    const activeNodeIds = new Set(
      (currentPause?.frames ?? []).flatMap((frame) => {
        const nodeId = closestRouteNodeId(routeNodes, frame);
        return nodeId ? [nodeId] : [];
      }),
    );
    const executedNodeIds = new Set(
      state.pauses.flatMap((pause) =>
        pause.frames.flatMap((frame) => {
          const nodeId = closestRouteNodeId(routeNodes, frame);
          return nodeId ? [nodeId] : [];
        }),
      ),
    );
    const route = state.route
      ? {
          ...state.route,
          nodes: state.route.nodes.map((node) => ({
            ...node,
            fileLabel: vscode.workspace.asRelativePath(node.location.path, false),
            breakpoint: hasSourceBreakpoint(node.location),
            executed: executedNodeIds.has(node.id),
            active: activeNodeIds.has(node.id),
            focused: node.id === focusedNodeId,
          })),
        }
      : undefined;
    const pauses = state.pauses.map((pause) => ({
      id: pause.id,
      reason: pause.reason,
      recordedAt: pause.recordedAt,
      frameCount: pause.frames.length,
      variableCount: pause.variables.length,
      label: pause.frames[0]
        ? `${pause.frames[0].name} · ${frameLocationLabel(pause.frames[0])}`
        : pause.reason,
      selected: pause.id === currentPause?.id,
    }));
    const frames = (currentPause?.frames ?? []).map((frame, index) => ({
      ...frame,
      index,
      fileLabel: frameLocationLabel(frame),
      selected: frame.id === state.selectedFrameId,
    }));
    this.stateVersion += 1;
    this.lastSentFrameCount = frames.length;
    this.lastAcknowledgedFrameCount = 0;

    void this.view.webview.postMessage({
      type: "state",
      version: this.stateVersion,
      state: {
        route,
        pauses,
        frames,
        variables: currentPause?.variables ?? [],
        tutorMessage: state.tutorMessage,
        busyMessage: state.busyMessage,
        debugStatus: state.debugStatus ?? (state.debugSessionId ? "running" : "idle"),
        livePauseId:
          state.debugStatus === "paused" ? state.pauses.at(-1)?.id : undefined,
        requestPending: Boolean(state.requestKind || state.busyMessage),
        requestKind: state.requestKind,
        modelProvider: this.actions.modelProviderStatus(),
        debugging: Boolean(state.debugSessionId),
        workspaceOpen: Boolean(vscode.workspace.workspaceFolders?.length),
        chatMessages: state.chatMessages,
      },
    });
  }

  private async handleMessage(value: unknown): Promise<void> {
    if (!isWebviewMessage(value)) {
      return;
    }
    switch (value.type) {
      case "ready":
        this.readyCount += 1;
        this.postState();
        return;
      case "renderedState":
        this.renderedStateCount += 1;
        this.lastReceivedVersion =
          typeof value.version === "number" ? value.version : undefined;
        if (this.lastReceivedVersion === this.stateVersion) {
          this.lastAcknowledgedFrameCount = this.lastSentFrameCount;
          this.renderedChatMessageCount =
            typeof value.chatMessageCount === "number" ? value.chatMessageCount : 0;
        }
        return;
      case "scriptError":
        this.scriptError = typeof value.error === "string" ? value.error : "unknown script error";
        return;
      case "locateRoute":
        if (typeof value.question === "string" && value.question.trim()) {
          await this.actions.askQuestion(value.question.trim());
        }
        return;
      case "startDebug":
        await this.actions.startGuidedDebug(
          typeof value.question === "string" ? value.question.trim() : undefined,
        );
        return;
      case "explain":
        await this.actions.explainPause(
          typeof value.question === "string" ? value.question.trim() : undefined,
        );
        return;
      case "configureModel":
        await this.actions.configureModelProvider();
        this.postState();
        return;
      case "openFolder":
        await vscode.commands.executeCommand("vscode.openFolder");
        return;
      case "selectRouteNode": {
        const node = this.store
          .snapshot()
          .route?.nodes.find((candidate) => candidate.id === value.nodeId);
        if (node) {
          await this.actions.revealLocation(node.location);
        }
        return;
      }
      case "toggleBreakpoint": {
        const node = this.store
          .snapshot()
          .route?.nodes.find((candidate) => candidate.id === value.nodeId);
        if (node) {
          this.actions.toggleBreakpoint(node.location);
        }
        return;
      }
      case "selectPause":
        if (typeof value.pauseId === "string") {
          this.store.selectPause(value.pauseId);
        }
        return;
      case "selectFrame": {
        if (typeof value.frameId !== "number") {
          return;
        }
        const pause = this.store.selectedPause();
        const frame = pause?.frames.find((candidate) => candidate.id === value.frameId);
        if (frame?.location) {
          this.store.selectFrame(frame.id);
          await this.actions.revealLocation(frame.location, frame.id);
        }
        return;
      }
      case "debugCommand":
        if (!this.selectedPauseIsLive()) {
          void vscode.window.showInformationMessage(
            "Return to the current pause before continuing or stepping the debugger.",
          );
          return;
        }
        if (
          value.command === "continue" ||
          value.command === "stepInto" ||
          value.command === "stepOver"
        ) {
          await this.actions.runDebugCommand(value.command);
        }
        return;
      default:
        return;
    }
  }

  private selectedPauseIsLive(): boolean {
    const state = this.store.snapshot();
    return (
      state.debugStatus === "paused" &&
      this.store.selectedPause()?.id === state.pauses.at(-1)?.id
    );
  }

}

function frameLocationLabel(frame: StackFrameSnapshot): string {
  return frame.location
    ? `${path.basename(frame.location.path)}:${frame.location.line}`
    : "no source";
}

function closestRouteNodeId(
  nodes: readonly RouteNode[],
  frame: StackFrameSnapshot,
): string | undefined {
  if (!frame.location) {
    return undefined;
  }
  const framePath = normalizePath(frame.location.path);
  const sameFile = nodes.filter(
    (node) => normalizePath(node.location.path) === framePath,
  );
  return sameFile.reduce<RouteNode | undefined>((closest, node) => {
    if (!closest) {
      return node;
    }
    return Math.abs(node.location.line - frame.location!.line) <
      Math.abs(closest.location.line - frame.location!.line)
      ? node
      : closest;
  }, undefined)?.id;
}

function isWebviewMessage(value: unknown): value is WebviewMessage {
  return value !== null && typeof value === "object";
}
