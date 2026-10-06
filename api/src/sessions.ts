export type Session = {
  events: Uint8Array[];
  blobs: Map<string, Uint8Array>;
};

export type SessionId = string;
export class Sessions {
  private sessions: Map<SessionId, Session>;

  constructor() {
    this.sessions = new Map();
  }

  session(id: string): Session {
    const session = this.sessions.get(id);
    if (session !== undefined) {
      return session;
    }
    const newSession: Session = {
      events: [],
      blobs: new Map(),
    };
    this.sessions.set(id, newSession);
    return newSession;
  }
}
