import { randomUUID } from "node:crypto";
import { ChangeEmitter, Disposable, Storage } from "../ports";
import {
  ChatMessage,
  ConversationRecord,
  ConversationSummary,
  DebugPause,
  RouteNode,
  RoutePlan,
  SessionState,
  TutorMessage,
} from "../domain/model";

export type SessionRequestKind = NonNullable<SessionState["requestKind"]>;

const CONVERSATIONS_KEY = "codeCat.conversations.v1";
const DEFAULT_CONVERSATION_TITLE = "新会话";
const MAX_CHAT_MESSAGES = 40;
const MAX_CONVERSATIONS = 20;
const MAX_TITLE_LENGTH = 36;

interface ConversationPersistence {
  readonly activeId: string;
  readonly conversations: readonly ConversationRecord[];
}

type WorkspaceMemento = Storage;

export class SessionStore implements Disposable {
  private readonly changeEmitter = new ChangeEmitter<SessionState>();
  private readonly conversations = new Map<string, ConversationRecord>();
  private pendingWrite = Promise.resolve();
  private state: SessionState;

  public readonly onDidChange = this.changeEmitter.event;

  public constructor(private readonly workspaceState?: WorkspaceMemento) {
    const restored = readPersistence(
      workspaceState?.get<unknown>(CONVERSATIONS_KEY),
    );
    for (const conversation of restored?.conversations ?? []) {
      this.conversations.set(conversation.id, conversation);
    }
    const active =
      (restored ? this.conversations.get(restored.activeId) : undefined) ??
      createConversation();
    this.conversations.set(active.id, active);
    this.state = stateFromConversation(active);
  }

  public snapshot(): SessionState {
    return this.state;
  }

  public conversationSummaries(): readonly ConversationSummary[] {
    return [...this.conversations.values()]
      .filter(hasConversationContent)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        active: conversation.id === this.state.conversationId,
      }));
  }

  public setRoute(route: RoutePlan): void {
    this.applyRoute(
      route,
      appendChatExchange(
        this.state.chatMessages,
        route.question,
        route.summary,
      ),
      this.state.requestKind,
    );
  }

  public completeQuestionWithRoute(route: RoutePlan): void {
    if (this.state.requestKind !== "question") {
      return;
    }
    this.applyRoute(
      route,
      appendChatMessage(
        this.state.chatMessages,
        "assistant",
        route.summary,
      ),
      undefined,
    );
  }

  public routeForMessage(messageId: string): RoutePlan | undefined {
    const message = this.state.chatMessages.find(item => item.id === messageId && item.role === "assistant");
    if (message?.route && isRoutePlan(message.route)) return message.route;
    return message?.text === this.state.route?.summary ? this.state.route : undefined;
  }

  public restoreReadingRoute(route: RoutePlan): void {
    this.updateConversation({ ...this.state, route, revealedRouteNodeCount: 1, tutorMessage: undefined });
  }

  public revealNextRouteNode(): boolean {
    const routeLength = this.state.route?.nodes.length ?? 0;
    if (this.state.revealedRouteNodeCount >= routeLength) {
      return false;
    }
    this.updateConversation({
      ...this.state,
      revealedRouteNodeCount: this.state.revealedRouteNodeCount + 1,
    });
    return true;
  }

  public recordPause(pause: DebugPause): void {
    if (pause.sessionId !== this.state.debugSessionId) {
      return;
    }
    const evidenceLabel = pauseLabel(pause);
    this.updateConversation({
      ...this.state,
      chatMessages: [...this.state.chatMessages, {
        id: randomUUID(), role: "assistant" as const,
        text: `已记录观察：${evidenceLabel}。这是暂停时的快照，不代表当前行已执行完成。`,
        pauseId: pause.id, evidenceLabel, observation: true,
      }].slice(-MAX_CHAT_MESSAGES),
      pauses: [...this.state.pauses, pause],
      selectedPauseId: pause.id,
      selectedFrameId: pause.frames[0]?.id,
      debugStatus: "paused",
      tutorMessage: undefined,
      contentMode: "debug",
      captureError: undefined,
    });
  }

  public selectPause(pauseId: string, frameId?: number): void {
    const pause = this.state.pauses.find((candidate) => candidate.id === pauseId);
    if (!pause) return;
    const tutorMessage =
      isPauseTutorMessage(this.state.tutorMessage) &&
      this.state.tutorMessage.pauseId === pauseId
        ? this.state.tutorMessage
        : undefined;
    this.update({
      ...this.state,
      selectedPauseId: pauseId,
      selectedFrameId: frameId ?? pause?.frames[0]?.id,
      tutorMessage,
      contentMode: "debug",
    });
  }

  public selectFrame(frameId: number): void {
    this.update({ ...this.state, selectedFrameId: frameId, contentMode: "debug" });
  }

  public selectedPause(): DebugPause | undefined {
    return (
      this.state.pauses.find((pause) => pause.id === this.state.selectedPauseId) ??
      this.state.pauses.at(-1)
    );
  }

  public markDebugSessionRunning(sessionId: string): void {
    if (this.state.debugSessionId !== sessionId || this.state.debugStatus === "running") {
      return;
    }
    this.update({ ...this.state, debugStatus: "running", contentMode: "debug", captureError: undefined });
  }

  public restoreDebugSessionPaused(sessionId: string): void {
    if (this.state.debugSessionId !== sessionId || !this.state.pauses.length) {
      return;
    }
    this.update({ ...this.state, debugStatus: "paused", contentMode: "debug" });
  }

  public beginDebugSession(sessionId: string): void {
    if (this.state.debugSessionId === sessionId) {
      return;
    }
    this.update({
      ...this.state,
      debugSessionId: sessionId,
      debugStatus: "running",
      pauses: [],
      selectedPauseId: undefined,
      selectedFrameId: undefined,
      tutorMessage: undefined,
      busyMessage: undefined,
      captureError: undefined,
    });
  }

  public endDebugSession(sessionId: string): void {
    if (this.state.debugSessionId !== sessionId) {
      return;
    }
    this.update({
      ...this.state,
      debugSessionId: undefined,
      debugStatus: "ended",
      contentMode: "debug",
    });
  }

  public setTutorMessage(message: TutorMessage): void {
    const pause = isPauseTutorMessage(message)
      ? this.state.pauses.find((candidate) => candidate.id === message.pauseId)
      : undefined;
    const chatMessages = message.kind === "pause" && pause
      ? [...this.state.chatMessages, {
          id: message.id, role: "assistant" as const,
          text: [message.explanation.whatHappened, message.explanation.whyItMatters,
            message.explanation.inspectNext].join("\n\n"),
          pauseId: pause.id, evidenceLabel: pauseLabel(pause),
        }].slice(-MAX_CHAT_MESSAGES)
      : this.state.chatMessages;
    this.updateConversation({
      ...this.state,
      chatMessages,
      tutorMessage: isPauseTutorMessage(message) && message.pauseId !== this.state.selectedPauseId
        ? undefined : message,
      contentMode: isPauseTutorMessage(message) ? "debug" : "chat",
      busyMessage: undefined,
    });
  }

  public addChatExchange(question: string, answer: string): void {
    this.updateConversation({
      ...this.state,
      conversationTitle: resolvedConversationTitle(
        this.state.conversationTitle,
        question,
      ),
      chatMessages: appendChatExchange(this.state.chatMessages, question, answer),
      tutorMessage: undefined,
      contentMode: "chat",
      busyMessage: undefined,
    });
  }

  public beginQuestion(question: string): readonly ChatMessage[] | undefined {
    if (this.state.requestKind) {
      return undefined;
    }
    const priorMessages = this.state.chatMessages;
    const pause = this.selectedPause();
    this.updateConversation({
      ...this.state,
      conversationTitle: resolvedConversationTitle(
        this.state.conversationTitle,
        question,
      ),
      chatMessages: [...this.state.chatMessages, {
        id: randomUUID(), role: "user" as const, text: question,
        pauseId: pause?.id, evidenceLabel: pause ? pauseLabel(pause) : undefined,
      }].slice(-MAX_CHAT_MESSAGES),
      tutorMessage: undefined,
      contentMode: "chat",
      busyMessage: "正在思考",
      requestKind: "question",
      retryQuestion: undefined,
    });
    return priorMessages;
  }

  public completeQuestionWithAnswer(answer: string, pause?: DebugPause): void {
    if (this.state.requestKind !== "question") {
      return;
    }
    this.updateConversation({
      ...this.state,
      chatMessages: [...this.state.chatMessages, {
        id: randomUUID(), role: "assistant" as const, text: answer,
        pauseId: pause?.id, evidenceLabel: pause ? pauseLabel(pause) : undefined,
      }].slice(-MAX_CHAT_MESSAGES),
      tutorMessage: undefined,
      contentMode: "chat",
      busyMessage: undefined,
      requestKind: undefined,
      retryQuestion: undefined,
    });
  }

  public completeQuestionWithTutorMessage(
    message: Extract<TutorMessage, { readonly kind: "system" | "error" }>,
  ): void {
    if (this.state.requestKind !== "question") {
      return;
    }
    this.updateConversation({
      ...this.state,
      tutorMessage: message,
      contentMode: "chat",
      busyMessage: undefined,
      requestKind: undefined,
      retryQuestion: [...this.state.chatMessages].reverse().find((item) => item.role === "user")?.text,
    });
  }

  public streamAnswer(text: string, pauseId?: string): void {
    if (this.state.requestKind !== "question" || !text) return;
    this.update({ ...this.state, streamingAnswer: { text, pauseId } });
  }

  public setBusy(message?: string): void {
    this.update({ ...this.state, busyMessage: message });
  }

  public reportCaptureError(sessionId: string): void {
    if (this.state.debugSessionId !== sessionId) return;
    this.update({ ...this.state, debugStatus: "paused", captureError:
      "程序已暂停，但现场采集失败。请在 VS Code 调试工具栏单步或重新运行以重新采集；也可以继续询问已有观察。" });
  }

  public beginRequest(kind: SessionRequestKind): boolean {
    if (this.state.requestKind) {
      return false;
    }
    this.update({ ...this.state, requestKind: kind });
    return true;
  }

  public endRequest(kind: SessionRequestKind): void {
    if (this.state.requestKind !== kind) {
      return;
    }
    this.update({ ...this.state, requestKind: undefined, busyMessage: undefined });
  }

  public clear(): boolean {
    if (this.state.requestKind) {
      return false;
    }
    this.rememberCurrentConversation();
    const conversation = createConversation();
    this.conversations.set(conversation.id, conversation);
    this.state = stateFromConversation(conversation);
    this.persist();
    this.changeEmitter.fire(this.state);
    return true;
  }

  public switchConversation(conversationId: string): boolean {
    if (this.state.requestKind) {
      return false;
    }
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }
    this.rememberCurrentConversation();
    this.state = stateFromConversation(conversation);
    this.persist();
    this.changeEmitter.fire(this.state);
    return true;
  }

  public async whenPersisted(): Promise<void> {
    await this.pendingWrite;
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  private update(next: SessionState): void {
    if (next.requestKind !== "question") next = { ...next, streamingAnswer: undefined };
    this.state = next;
    this.changeEmitter.fire(next);
  }

  private updateConversation(next: SessionState): void {
    if (next.requestKind !== "question") next = { ...next, streamingAnswer: undefined };
    this.state = next;
    this.rememberCurrentConversation(true);
    this.persist();
    this.changeEmitter.fire(next);
  }

  private applyRoute(
    route: RoutePlan,
    chatMessages: readonly ChatMessage[],
    requestKind: SessionState["requestKind"],
  ): void {
    // 路径围绕一个探索目标累积：这次提问只追加它带来的站点，已有站点保留。
    // 之前这里整条替换 route，用户连续追问时上一条链路连同现场证据一起消失了。
    const merged = accumulateRoute(
      this.state.route,
      this.state.revealedRouteNodeCount,
      route,
    );
    this.updateConversation({
      ...this.state,
      conversationTitle: resolvedConversationTitle(
        this.state.conversationTitle,
        route.question,
      ),
      chatMessages: chatMessages.map((message, index) => index === chatMessages.length - 1
        && message.role === "assistant" && message.text === route.summary ? { ...message, route: merged.route } : message),
      route: merged.route,
      revealedRouteNodeCount: merged.revealedRouteNodeCount,
      // pauses / selectedPauseId / selectedFrameId / debugStatus 刻意不在这里重置：
      // 它们是这次探索已经采集到的运行证据，属于同一个上下文，不该被下一个问题清掉。
      busyMessage: undefined,
      requestKind,
      tutorMessage: {
        id: randomUUID(),
        kind: "route",
        text: merged.route.summary,
      },
      contentMode: "chat",
    });
  }

  /**
   * 采纳模型建议的新探索目标：只保留本次提问带来的站点，旧路径留在会话历史里。
   * 没有待确认目标、或本次提问没有带来任何新站点时，不改动状态。
   */
  public startNewGoal(): boolean {
    const route = this.state.route;
    if (!route?.pendingGoal) {
      return false;
    }
    const kept = route.nodes.filter(
      (node) => node.addedByQuestion === route.question,
    );
    if (kept.length === 0) {
      return false;
    }
    this.updateConversation({
      ...this.state,
      route: {
        question: route.question,
        summary: route.summary,
        goal: route.pendingGoal,
        nodes: kept,
      },
      revealedRouteNodeCount: kept.length,
    });
    return true;
  }

  private rememberCurrentConversation(touch = false): void {
    const previous = this.conversations.get(this.state.conversationId);
    const now = new Date().toISOString();
    this.conversations.set(this.state.conversationId, {
      id: this.state.conversationId,
      title: this.state.conversationTitle,
      createdAt: previous?.createdAt ?? now,
      updatedAt: touch ? now : (previous?.updatedAt ?? now),
      chatMessages: this.state.chatMessages,
      route: this.state.route,
      revealedRouteNodeCount: this.state.revealedRouteNodeCount,
    });
  }

  private persist(): void {
    if (!this.workspaceState) {
      return;
    }
    const conversations = retainedConversations(
      [...this.conversations.values()],
      this.state.conversationId,
    );
    this.conversations.clear();
    for (const conversation of conversations) {
      this.conversations.set(conversation.id, conversation);
    }
    const value: ConversationPersistence = {
      activeId: this.state.conversationId,
      conversations,
    };
    this.pendingWrite = this.pendingWrite
      .catch(() => undefined)
      .then(() => this.workspaceState?.update(CONVERSATIONS_KEY, value))
      .catch((error: unknown) => {
        console.error("Code Cat could not persist conversation history.", error);
      });
  }
}

function stateFromConversation(conversation: ConversationRecord): SessionState {
  return {
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    route: conversation.route,
    revealedRouteNodeCount: Math.min(
      conversation.route?.nodes.length ?? 0,
      Math.max(0, conversation.revealedRouteNodeCount),
    ),
    pauses: [],
    chatMessages: conversation.chatMessages,
    debugStatus: "idle",
    contentMode: conversation.chatMessages.length > 0 ? "chat" : undefined,
  };
}

export function pauseLabel(pause: DebugPause): string {
  const frame = pause.frames[0];
  const location = frame?.location;
  return location
    ? `${location.path.split(/[\\/]/u).at(-1)}:${location.line}`
    : frame?.name ?? "未知源码位置";
}

/** 站点身份按「文件 + 行」判定：同一行不重复出现在路径上。 */
function routeNodeKey(node: RouteNode): string {
  return `${node.location.path}:${node.location.line}`;
}

/**
 * 把一次提问产生的路线并进当前路径。
 * 已有站点原样保留，只追加按「文件 + 行」判定为新站点的部分；探索目标只在模型给出时更新。
 */
function accumulateRoute(
  current: RoutePlan | undefined,
  currentRevealed: number,
  incoming: RoutePlan,
): { readonly route: RoutePlan; readonly revealedRouteNodeCount: number } {
  const existing = current?.nodes ?? [];
  if (existing.length === 0) {
    return {
      // 还没有路径时，「换目标」无从谈起：模型给的 pendingGoal 就是这次的目标。
      route: {
        ...incoming,
        goal: incoming.goal ?? incoming.pendingGoal,
        pendingGoal: undefined,
      },
      revealedRouteNodeCount: incoming.nodes.length > 0 ? 1 : 0,
    };
  }
  const seen = new Set(existing.map(routeNodeKey));
  const added = incoming.nodes
    .filter((node) => !seen.has(routeNodeKey(node)))
    // 打上「哪个问题带来这一站」，界面据此标出本次新增。
    .map((node) => ({ ...node, addedByQuestion: incoming.question }));
  const nodes = [...existing, ...added];
  return {
    route: {
      question: incoming.question,
      summary: incoming.summary,
      // 换目标要用户确认，确认之前当前目标不变。
      goal: incoming.pendingGoal ? current?.goal : incoming.goal ?? current?.goal,
      pendingGoal: incoming.pendingGoal,
      nodes,
    },
    // 已展开的站点保持展开，本次新增的也直接可见；否则用户看到的还是「路径没变」。
    revealedRouteNodeCount: Math.min(
      nodes.length,
      Math.max(1, currentRevealed) + added.length,
    ),
  };
}

function createConversation(): ConversationRecord {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: DEFAULT_CONVERSATION_TITLE,
    createdAt: now,
    updatedAt: now,
    chatMessages: [],
    revealedRouteNodeCount: 0,
  };
}

function isPauseTutorMessage(
  message: TutorMessage | undefined,
): message is Extract<TutorMessage, { readonly kind: "pause" | "pause-error" }> {
  return message?.kind === "pause" || message?.kind === "pause-error";
}

function appendChatExchange(
  current: readonly ChatMessage[],
  question: string,
  answer: string,
): readonly ChatMessage[] {
  return appendChatMessage(
    appendChatMessage(current, "user", question),
    "assistant",
    answer,
  );
}

function appendChatMessage(
  current: readonly ChatMessage[],
  role: ChatMessage["role"],
  text: string,
): readonly ChatMessage[] {
  return [...current, { id: randomUUID(), role, text }].slice(-MAX_CHAT_MESSAGES);
}

function resolvedConversationTitle(current: string, question: string): string {
  if (current !== DEFAULT_CONVERSATION_TITLE) {
    return current;
  }
  const singleLine = question.replace(/\s+/gu, " ").trim();
  return singleLine.length <= MAX_TITLE_LENGTH
    ? singleLine
    : `${singleLine.slice(0, MAX_TITLE_LENGTH - 1)}…`;
}

function hasConversationContent(conversation: ConversationRecord): boolean {
  return conversation.chatMessages.length > 0 || conversation.route !== undefined;
}

function retainedConversations(
  conversations: readonly ConversationRecord[],
  activeId: string,
): readonly ConversationRecord[] {
  const active = conversations.find((conversation) => conversation.id === activeId);
  const recentLimit =
    active && hasConversationContent(active)
      ? MAX_CONVERSATIONS - 1
      : MAX_CONVERSATIONS;
  const recent = conversations
    .filter((conversation) => conversation.id !== activeId && hasConversationContent(conversation))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, recentLimit);
  return active ? [active, ...recent] : recent;
}

function readPersistence(value: unknown): ConversationPersistence | undefined {
  const object = readObject(value);
  const activeId = object?.activeId;
  const candidates = object?.conversations;
  if (typeof activeId !== "string" || !Array.isArray(candidates)) {
    return undefined;
  }
  const conversations = candidates.flatMap((candidate) => {
    const conversation = readConversation(candidate);
    return conversation ? [conversation] : [];
  });
  return conversations.length > 0 ? { activeId, conversations } : undefined;
}

function readConversation(value: unknown): ConversationRecord | undefined {
  const object = readObject(value);
  if (
    typeof object?.id !== "string" ||
    typeof object.title !== "string" ||
    typeof object.createdAt !== "string" ||
    typeof object.updatedAt !== "string" ||
    !Array.isArray(object.chatMessages)
  ) {
    return undefined;
  }
  const chatMessages = object.chatMessages.filter(isChatMessage).map(message => ({
    ...message, route: isRoutePlan(message.route) ? message.route : undefined,
  }));
  const route = isRoutePlan(object.route) ? object.route : undefined;
  const revealedRouteNodeCount =
    typeof object.revealedRouteNodeCount === "number" &&
    Number.isFinite(object.revealedRouteNodeCount)
      ? Math.max(0, Math.floor(object.revealedRouteNodeCount))
      : route?.nodes.length
        ? 1
        : 0;
  return {
    id: object.id,
    title: object.title,
    createdAt: object.createdAt,
    updatedAt: object.updatedAt,
    chatMessages,
    route,
    revealedRouteNodeCount,
  };
}

function isChatMessage(value: unknown): value is ChatMessage {
  const object = readObject(value);
  return (
    typeof object?.id === "string" &&
    (object.role === "user" || object.role === "assistant") &&
    typeof object.text === "string"
  );
}

function isRoutePlan(value: unknown): value is RoutePlan {
  const object = readObject(value);
  return (
    typeof object?.question === "string" &&
    typeof object.summary === "string" &&
    Array.isArray(object.nodes) &&
    object.nodes.every(isRouteNode) &&
    (object.goal === undefined || typeof object.goal === "string") &&
    (object.pendingGoal === undefined || typeof object.pendingGoal === "string")
  );
}

function isRouteNode(value: unknown): value is RoutePlan["nodes"][number] {
  const object = readObject(value);
  return (
    typeof object?.id === "string" &&
    typeof object.title === "string" &&
    (object.symbol === undefined || typeof object.symbol === "string") &&
    isSourceLocation(object.location) &&
    typeof object.reason === "string" &&
    (object.role === undefined || typeof object.role === "string") &&
    (object.relation === undefined || typeof object.relation === "string") &&
    (object.addedByQuestion === undefined ||
      typeof object.addedByQuestion === "string") &&
    (object.confidence === "high" ||
      object.confidence === "medium" ||
      object.confidence === "low")
  );
}

function isSourceLocation(value: unknown): value is RoutePlan["nodes"][number]["location"] {
  const object = readObject(value);
  return (
    typeof object?.path === "string" &&
    typeof object.line === "number" &&
    Number.isInteger(object.line) &&
    object.line >= 1 &&
    typeof object.column === "number" &&
    Number.isInteger(object.column) &&
    object.column >= 1
  );
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
