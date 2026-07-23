import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import {
  DebugPause,
  RoutePlan,
  SessionState,
  TutorMessage,
} from "../domain/model";

export class SessionStore implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<SessionState>();
  private state: SessionState = { pauses: [] };

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
      tutorMessage: undefined,
      busyMessage: undefined,
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
      busyMessage: undefined,
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

  public beginDebugSession(sessionId: string): void {
    if (this.state.debugSessionId === sessionId) {
      return;
    }
    this.update({
      ...this.state,
      debugSessionId: sessionId,
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
    this.update({ ...this.state, debugSessionId: undefined, busyMessage: undefined });
  }

  public setTutorMessage(message: TutorMessage): void {
    if (message.pauseId && message.pauseId !== this.state.selectedPauseId) {
      return;
    }
    this.update({ ...this.state, tutorMessage: message, busyMessage: undefined });
  }

  public setBusy(message?: string): void {
    this.update({ ...this.state, busyMessage: message });
  }

  public clear(): void {
    this.update({ pauses: [] });
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  private update(next: SessionState): void {
    this.state = next;
    this.changeEmitter.fire(next);
  }
}
