import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import {
  ChatMessage,
  DebugPause,
  RoutePlan,
  SessionState,
  TutorMessage,
} from "../domain/model";

export type SessionRequestKind = NonNullable<SessionState["requestKind"]>;
const MAX_CHAT_MESSAGES = 40;

export class SessionStore implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<SessionState>();
  private state: SessionState = { pauses: [], chatMessages: [] };

  public readonly onDidChange = this.changeEmitter.event;

  public snapshot(): SessionState {
    return this.state;
  }

  public setRoute(route: RoutePlan): void {
    const preserveDebugSnapshot = Boolean(this.state.debugSessionId);
    this.update({
      ...this.state,
      chatMessages: appendChatExchange(
        this.state.chatMessages,
        route.question,
        route.summary,
      ),
      route,
      pauses: preserveDebugSnapshot ? this.state.pauses : [],
      selectedPauseId: preserveDebugSnapshot ? this.state.selectedPauseId : undefined,
      selectedFrameId: preserveDebugSnapshot ? this.state.selectedFrameId : undefined,
      debugStatus: this.state.debugSessionId ? this.state.debugStatus : "idle",
      busyMessage: undefined,
      tutorMessage: {
        id: randomUUID(),
        kind: "route",
        markdown: route.summary,
      },
      contentMode: "route",
    });
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
      this.state.tutorMessage?.pauseId === pauseId ? this.state.tutorMessage : undefined;
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
    if (message.pauseId && message.pauseId !== this.state.selectedPauseId) {
      this.update({ ...this.state, busyMessage: undefined });
      return;
    }
    this.update({
      ...this.state,
      tutorMessage: message,
      contentMode:
        message.kind === "route"
          ? "route"
          : message.kind === "pause"
            ? "debug"
            : "message",
      busyMessage: undefined,
    });
  }

  public addChatExchange(question: string, answer: string): void {
    this.update({
      ...this.state,
      chatMessages: appendChatExchange(this.state.chatMessages, question, answer),
      tutorMessage: undefined,
      contentMode: "chat",
      busyMessage: undefined,
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
    this.update({ pauses: [], chatMessages: [], debugStatus: "idle", contentMode: undefined });
    return true;
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  private update(next: SessionState): void {
    this.state = next;
    this.changeEmitter.fire(next);
  }
}

function appendChatExchange(
  current: readonly ChatMessage[],
  question: string,
  answer: string,
): readonly ChatMessage[] {
  return [
    ...current,
    { id: randomUUID(), role: "user" as const, text: question },
    { id: randomUUID(), role: "assistant" as const, text: answer },
  ].slice(-MAX_CHAT_MESSAGES);
}
