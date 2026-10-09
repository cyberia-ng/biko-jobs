import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";
import { inspect } from "node:util";

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

  constructor(sqlitePath: string) {
    this.db = new DatabaseSync(sqlitePath);
    this.db.exec("PRAGMA foreign_keys = on;");
    migrateDb(this.db);
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

function migrateDb(db: DatabaseSync) {
  const migrationsDir = join(import.meta.dirname, "..", "db-migrations");
  const migrationsFilenames = readdirSync(migrationsDir);
  const migrations = migrationsFilenames
    .map((filename) => {
      const match = filename.match(/^(\d+)(-.*)?\.sql$/);
      if (match === null) {
        throw new Error("migration had unexpected filename");
      }
      const num = parseInt(match[1]!, 10);
      return { migration: readFileSync(join(migrationsDir, filename), "utf8"), filename, num };
    })
    .toSorted(({ num: numA }, { num: numB }) => numA - numB);
  const getPragmaStmt = db.prepare("PRAGMA user_version;");
  const version = getPragmaStmt.get()![0] as number;
  for (const migration of migrations) {
    if (migration.num <= version) continue;
    db.exec("BEGIN TRANSACTION;");
    try {
      db.exec(migration.migration);
      db.exec(`PRAGMA user_version = ${migration.num};`);
      db.exec("COMMIT;");
    } catch (e) {
      db.exec("ROLLBACK;");
      throw new Error(`migration failed: ${migration.filename}; ${inspect(e)}`);
    }
  }
}
