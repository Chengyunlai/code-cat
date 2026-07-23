export interface SourceLocation {
  readonly path: string;
  readonly line: number;
  readonly column: number;
}

export interface VariableSnapshot {
  readonly name: string;
  readonly value: string;
  readonly type?: string;
}

export interface StackFrameSnapshot {
  readonly id: number;
  readonly name: string;
  readonly location?: SourceLocation;
}

export interface DebugPause {
  readonly id: string;
  readonly sessionId: string;
  readonly reason: string;
  readonly description?: string;
  readonly threadId: number;
  readonly recordedAt: string;
  readonly frames: readonly StackFrameSnapshot[];
  readonly variables: readonly VariableSnapshot[];
}

export interface RouteNode {
  readonly id: string;
  readonly title: string;
  readonly symbol?: string;
  readonly location: SourceLocation;
  readonly reason: string;
  readonly confidence: "high" | "medium" | "low";
}

export interface RoutePlan {
  readonly question: string;
  readonly summary: string;
  readonly nodes: readonly RouteNode[];
}

export interface TutorMessage {
  readonly id: string;
  readonly kind: "route" | "pause" | "system" | "error";
  readonly markdown: string;
  readonly pauseId?: string;
}

export interface SessionState {
  readonly route?: RoutePlan;
  readonly debugSessionId?: string;
  readonly debugStatus?: "idle" | "running" | "paused" | "ended";
  readonly pauses: readonly DebugPause[];
  readonly selectedPauseId?: string;
  readonly selectedFrameId?: number;
  readonly tutorMessage?: TutorMessage;
  readonly busyMessage?: string;
  readonly requestKind?: "route" | "pause" | "debug" | "control" | "model";
}

export interface DapStackFrame {
  readonly id: number;
  readonly name: string;
  readonly line: number;
  readonly column: number;
  readonly source?: {
    readonly path?: string;
  };
}

export interface DapVariable {
  readonly name: string;
  readonly value: string;
  readonly type?: string;
  readonly variablesReference?: number;
}
