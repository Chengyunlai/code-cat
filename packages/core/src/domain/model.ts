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
  /** 该文件或模块在本项目里承担的职责：它为什么存在。可选，缺失时界面不显示职责行。 */
  readonly role?: string;
  /** 与上一个阅读节点的关系：调用方向、数据来源或跨越的边界。首个节点不填。 */
  readonly relation?: string;
  /**
   * 带来这一站的那次提问。路径累积后，界面用它标出「本次新增」。
   * 第一条路径上的站点不填——那批站点不是「新增」，而是起点。
   */
  readonly addedByQuestion?: string;
  readonly confidence: "high" | "medium" | "low";
}

export interface RoutePlan {
  /** 最近一次提问。历史消息靠它把回答和路径对应起来。 */
  readonly question: string;
  readonly summary: string;
  readonly nodes: readonly RouteNode[];
  /** 学习者当前正在理解的那个功能，一句话。路径围绕它累积。 */
  readonly goal?: string;
  /**
   * 模型认为这次提问已经换了一个功能，建议改目标。非空时界面给出「开始新的探索目标」入口；
   * 在用户选择之前，已有站点必须原样保留。
   */
  readonly pendingGoal?: string;
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
  readonly route?: RoutePlan;
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
  readonly streamingAnswer?: { readonly text: string; readonly pauseId?: string };
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
