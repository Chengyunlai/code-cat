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
    this.update({
      ...this.state,
      route,
      pauses: [],
      selectedPauseId: undefined,
      selectedFrameId: undefined,
      debugStatus: this.state.debugSessionId ? this.state.debugStatus : "idle",
      busyMessage: undefined,
      tutorMessage: {
        id: randomUUID(),
        kind: "route",
        markdown: route.summary,
      },
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
    });
  }

  public selectFrame(frameId: number): void {
    this.update({ ...this.state, selectedFrameId: frameId });
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
    this.update({ ...this.state, debugStatus: "running" });
  }

  public restoreDebugSessionPaused(sessionId: string): void {
    if (this.state.debugSessionId !== sessionId || !this.state.pauses.length) {
      return;
    }
    this.update({ ...this.state, debugStatus: "paused" });
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
      busyMessage: undefined,
    });
  }

  public addChatExchange(question: string, answer: string): void {
    const messages: ChatMessage[] = [
      { id: randomUUID(), role: "user", text: question },
      { id: randomUUID(), role: "assistant", text: answer },
    ];
    this.update({
      ...this.state,
      chatMessages: [...this.state.chatMessages, ...messages].slice(-MAX_CHAT_MESSAGES),
      tutorMessage: {
        id: randomUUID(),
        kind: "chat",
        markdown: answer,
      },
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
    this.update({ pauses: [], chatMessages: [], debugStatus: "idle" });
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
