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
  readonly source?: string;
  readonly captureNote?: string;
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

export interface PauseExplanation {
  readonly whatHappened: string;
  readonly whyItMatters: string;
  readonly inspectNext: string;
}

export type TutorMessage =
  | {
      readonly id: string;
      readonly kind: "route";
      readonly text: string;
    }
  | {
      readonly id: string;
      readonly kind: "pause";
      readonly pauseId: string;
      readonly explanation: PauseExplanation;
    }
  | {
      readonly id: string;
      readonly kind: "pause-error";
      readonly pauseId: string;
      readonly text: string;
    }
  | {
      readonly id: string;
      readonly kind: "system" | "error";
      readonly text: string;
    };

export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly pauseId?: string;
  readonly evidenceLabel?: string;
  readonly observation?: boolean;
}

export interface ConversationRecord {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly chatMessages: readonly ChatMessage[];
  readonly route?: RoutePlan;
  readonly revealedRouteNodeCount: number;
}

export interface ConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly active: boolean;
}

export interface SessionState {
  readonly conversationId: string;
  readonly conversationTitle: string;
  readonly route?: RoutePlan;
  readonly revealedRouteNodeCount: number;
  readonly debugSessionId?: string;
  readonly debugStatus?: "idle" | "running" | "paused" | "ended";
  readonly pauses: readonly DebugPause[];
  readonly chatMessages: readonly ChatMessage[];
  readonly selectedPauseId?: string;
  readonly selectedFrameId?: number;
  readonly tutorMessage?: TutorMessage;
  readonly contentMode?: "chat" | "debug";
  readonly busyMessage?: string;
  readonly retryQuestion?: string;
  readonly captureError?: string;
  readonly requestKind?: "question" | "pause" | "debug" | "control" | "model";
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
