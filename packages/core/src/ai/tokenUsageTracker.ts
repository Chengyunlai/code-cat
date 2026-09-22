import { ChangeEmitter, Disposable, Storage } from "../ports";
import {
  ModelUsageRecord,
  TokenCounts,
  TokenUsage,
  TokenUsageSnapshot,
  TokenUsageTotals,
} from "./tokenUsage";

const PROJECT_USAGE_KEY = "codeCat.tokenUsage.project.v1";

export class TokenUsageTracker implements Disposable {
  private readonly changeEmitter = new ChangeEmitter<TokenUsageSnapshot>();
  private last: ModelUsageRecord | undefined;
  private session = emptyTokenUsageTotals();
  private project: TokenUsageTotals;
  private pendingWrite = Promise.resolve();

  public readonly onDidChange = this.changeEmitter.event;

  public constructor(
    private readonly workspaceState: Storage,
  ) {
    this.project = readTokenUsageTotals(workspaceState.get<unknown>(PROJECT_USAGE_KEY));
  }

  public snapshot(): TokenUsageSnapshot {
    return {
      last: this.last,
      session: this.session,
      project: this.project,
    };
  }

  public async record(
    usage: TokenUsage,
    metadata: Pick<ModelUsageRecord, "requestKind" | "provider" | "model">,
  ): Promise<void> {
    this.last = {
      ...metadata,
      recordedAt: new Date().toISOString(),
      usage,
    };
    this.session = addUsage(this.session, usage);
    this.project = addUsage(this.project, usage);
    this.changeEmitter.fire(this.snapshot());
    await this.persistProject();
  }

  public clearSession(): void {
    this.last = undefined;
    this.session = emptyTokenUsageTotals();
    this.changeEmitter.fire(this.snapshot());
  }

  public async resetProject(): Promise<void> {
    this.project = emptyTokenUsageTotals();
    this.changeEmitter.fire(this.snapshot());
    await this.persistProject();
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  private async persistProject(): Promise<void> {
    const value = this.project;
    this.pendingWrite = this.pendingWrite.then(() =>
      this.workspaceState.update(PROJECT_USAGE_KEY, value),
    );
    await this.pendingWrite;
  }
}

function addUsage(current: TokenUsageTotals, usage: TokenUsage): TokenUsageTotals {
  const source = usage.source;
  return {
    ...current,
    [source]: addCounts(current[source], usage),
  };
}

function addCounts(current: TokenCounts, usage: TokenUsage): TokenCounts {
  return {
    inputTokens: current.inputTokens + usage.inputTokens,
    outputTokens: current.outputTokens + usage.outputTokens,
    totalTokens: current.totalTokens + usage.totalTokens,
    cacheReadTokens: current.cacheReadTokens + usage.cacheReadTokens,
    cacheWriteTokens: current.cacheWriteTokens + usage.cacheWriteTokens,
  };
}

function readTokenUsageTotals(value: unknown): TokenUsageTotals {
  const object = readObject(value);
  return {
    reported: readTokenCounts(object?.reported),
    estimated: readTokenCounts(object?.estimated),
  };
}

function readTokenCounts(value: unknown): TokenCounts {
  const object = readObject(value);
  return {
    inputTokens: readCount(object?.inputTokens),
    outputTokens: readCount(object?.outputTokens),
    totalTokens: readCount(object?.totalTokens),
    cacheReadTokens: readCount(object?.cacheReadTokens),
    cacheWriteTokens: readCount(object?.cacheWriteTokens),
  };
}

function emptyTokenUsageTotals(): TokenUsageTotals {
  return {
    reported: emptyTokenCounts(),
    estimated: emptyTokenCounts(),
  };
}

function emptyTokenCounts(): TokenCounts {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}
