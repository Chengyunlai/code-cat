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
      tutorMessage: {
        id: randomUUID(),
        kind: "route",
        markdown: route.summary,
      },
    });
  }

  public recordPause(pause: DebugPause): void {
    this.update({
      ...this.state,
      pauses: [...this.state.pauses, pause],
      selectedPauseId: pause.id,
      selectedFrameId: pause.frames[0]?.id,
      busyMessage: undefined,
    });
  }

  public selectPause(pauseId: string, frameId?: number): void {
    this.update({
      ...this.state,
      selectedPauseId: pauseId,
      selectedFrameId: frameId,
    });
  }

  public selectFrame(frameId: number): void {
    this.update({ ...this.state, selectedFrameId: frameId });
  }

  public setTutorMessage(message: TutorMessage): void {
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
