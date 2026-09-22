import type { ModelRequestKind } from "./ai/tokenUsage";

export interface Disposable { dispose(): void; }
export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): Disposable;
}
export class CancellationError extends Error {
  constructor() { super("Cancelled"); this.name = "Canceled"; }
}
export function cancellationToken(signal: AbortSignal): CancellationToken {
  return { get isCancellationRequested() { return signal.aborted; },
    onCancellationRequested(listener) {
      signal.addEventListener("abort", listener);
      return { dispose: () => signal.removeEventListener("abort", listener) };
    } };
}
export interface Storage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}
export interface SourceDocument {
  readonly languageId: string;
  readonly lineCount: number;
  lineAt(index: number): { readonly text: string };
}
export interface ProjectContext {
  readinessIssue(): Promise<{kind: "no-workspace" | "no-source-files"; message: string} | undefined>;
  promptContext(question: string): Promise<string>;
  resolveFile(candidate: string): Promise<string | undefined>;
  readSourceFile(path: string): Promise<SourceDocument>;
}
export interface ModelGateway {
  request(prompt: string, token: CancellationToken, kind: ModelRequestKind,
    onText?: (text: string) => void): Promise<string>;
}
/** Small synchronous domain event. Host lifecycles own the returned subscriptions. */
export class ChangeEmitter<T> implements Disposable {
  private readonly listeners = new Set<(value: T) => void>();
  readonly event = (listener: (value: T) => void): Disposable => {
    this.listeners.add(listener);
    return { dispose: () => { this.listeners.delete(listener); } };
  };
  fire(value: T): void { for (const listener of [...this.listeners]) listener(value); }
  dispose(): void { this.listeners.clear(); }
}
