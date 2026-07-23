import { SessionRequestKind, SessionStore } from "./sessionStore";

export class SessionActionCoordinator {
  public constructor(private readonly store: SessionStore) {}

  public async run(kind: SessionRequestKind, action: () => Promise<void>): Promise<void> {
    if (!this.store.beginRequest(kind)) {
      return;
    }
    try {
      await action();
    } finally {
      this.store.endRequest(kind);
    }
  }
}
