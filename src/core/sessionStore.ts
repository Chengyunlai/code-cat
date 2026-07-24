import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import {
  ChatMessage,
  ConversationRecord,
  ConversationSummary,
  DebugPause,
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

type WorkspaceMemento = Pick<vscode.Memento, "get" | "update">;

export class SessionStore implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<SessionState>();
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
    this.update({
      ...this.state,
      pauses: [...this.state.pauses, pause],
      selectedPauseId: pause.id,
      selectedFrameId: pause.frames[0]?.id,
      debugStatus: "paused",
      tutorMessage: undefined,
      contentMode: "debug",
    });
  }

  public selectPause(pauseId: string, frameId?: number): void {
    const pause = this.state.pauses.find((candidate) => candidate.id === pauseId);
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
    this.update({ ...this.state, debugStatus: "running", contentMode: "debug" });
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
    if (isPauseTutorMessage(message) && message.pauseId !== this.state.selectedPauseId) {
      this.update({ ...this.state, busyMessage: undefined });
      return;
    }
    this.update({
      ...this.state,
      tutorMessage: message,
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
    this.updateConversation({
      ...this.state,
      conversationTitle: resolvedConversationTitle(
        this.state.conversationTitle,
        question,
      ),
      chatMessages: appendChatMessage(this.state.chatMessages, "user", question),
      tutorMessage: undefined,
      contentMode: "chat",
      busyMessage: "正在思考",
      requestKind: "question",
    });
    return priorMessages;
  }

  public completeQuestionWithAnswer(answer: string): void {
    if (this.state.requestKind !== "question") {
      return;
    }
    this.updateConversation({
      ...this.state,
      chatMessages: appendChatMessage(this.state.chatMessages, "assistant", answer),
      tutorMessage: undefined,
      contentMode: "chat",
      busyMessage: undefined,
      requestKind: undefined,
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
    });
  }

  public setBusy(message?: string): void {
    this.update({ ...this.state, busyMessage: message });
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
    this.update({ ...this.state, requestKind: undefined });
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
    this.state = next;
    this.changeEmitter.fire(next);
  }

  private updateConversation(next: SessionState): void {
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
    const preserveDebugSnapshot = Boolean(this.state.debugSessionId);
    this.updateConversation({
      ...this.state,
      conversationTitle: resolvedConversationTitle(
        this.state.conversationTitle,
        route.question,
      ),
      chatMessages,
      route,
      revealedRouteNodeCount: route.nodes.length > 0 ? 1 : 0,
      pauses: preserveDebugSnapshot ? this.state.pauses : [],
      selectedPauseId: preserveDebugSnapshot ? this.state.selectedPauseId : undefined,
      selectedFrameId: preserveDebugSnapshot ? this.state.selectedFrameId : undefined,
      debugStatus: this.state.debugSessionId ? this.state.debugStatus : "idle",
      busyMessage: undefined,
      requestKind,
      tutorMessage: {
        id: randomUUID(),
        kind: "route",
        text: route.summary,
      },
      contentMode: "chat",
    });
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
  const chatMessages = object.chatMessages.filter(isChatMessage);
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
    object.nodes.every(isRouteNode)
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
