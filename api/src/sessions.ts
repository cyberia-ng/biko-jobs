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

  addEvent(sessionId: string, event: Uint8Array) {
    const session = this.session(sessionId);
    session.events.push(event);
  }

  events(sessionId: string): Uint8Array[] {
    const session = this.session(sessionId);
    return session.events;
  }

  addBlob(sessionId: string, blobId: string, data: Uint8Array) {
    const session = this.session(sessionId);
    session.blobs.set(blobId, data);
  }

  blob(sessionId: string, blobId: string): Uint8Array | undefined {
    const session = this.session(sessionId);
    return session.blobs.get(blobId);
  }

  sessionIds(): SessionId[] {
    return Array.from(this.sessions.keys());
  }

  private session(id: string): Session {
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
