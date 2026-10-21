import { DatabaseSync, StatementSync } from "node:sqlite";

export class Sessions {
  private db: DatabaseSync;
  private statements: {
    getOrInsertSession: StatementSync;
    addEvent: StatementSync;
    readEvents: StatementSync;
    addBlob: StatementSync;
    getBlob: StatementSync;
    listSessions: StatementSync;
  };

  constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec("PRAGMA foreign_keys = on;");
    this.statements = {
      getOrInsertSession: this.db.prepare(
        "INSERT INTO sessions (name) VALUES (?) ON CONFLICT (name) DO UPDATE SET name = name RETURNING id;",
      ),
      addEvent: this.db.prepare("INSERT INTO events (session, data) VALUES (?, ?);"),
      readEvents: this.db.prepare(
        "SELECT (data) FROM events LEFT JOIN sessions ON events.session = sessions.id WHERE sessions.name = ? ORDER BY events.id;",
      ),
      addBlob: this.db.prepare("INSERT INTO blobs (session, name, data) VALUES (?, ?, ?);"),
      getBlob: this.db.prepare(
        "SELECT (data) FROM blobs LEFT JOIN sessions ON blobs.session = sessions.id WHERE sessions.name = ? AND blobs.name = ?;",
      ),
      listSessions: this.db.prepare("SELECT (name) FROM sessions ORDER BY id;"),
    };
  }

  addEvent(session: string, event: Uint8Array) {
    const id = this.statements.getOrInsertSession.get(session)!.id as number;
    this.statements.addEvent.run(id, event);
  }

  events(session: string): Uint8Array[] {
    const rows = this.statements.readEvents.all(session);
    return rows.map((row) => row.data as Uint8Array);
  }

  addBlob(session: string, blob: string, data: Uint8Array): boolean {
    const id = this.statements.getOrInsertSession.get(session)!.id as number;
    try {
      this.statements.addBlob.run(id, blob, data);
      return true;
    } catch (e) {
      if ((e as any).errstr === "constraint failed") {
        return false;
      }
      throw e;
    }
  }

  blob(session: string, blob: string): Uint8Array | undefined {
    return this.statements.getBlob.get(session, blob)?.data as Uint8Array | undefined;
  }

  sessionNames(): string[] {
    return this.statements.listSessions.all().map((row) => row.name as string);
  }
}
