import { Encoder } from "@msgpack/msgpack";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";
import { inspect } from "node:util";
import * as z from "zod";
import { sha256 } from "@noble/hashes/sha2.js";

const encoder = new Encoder();

export const FinalizationData = z.object({
  events: z.array(z.instanceof(Uint8Array)),
  existingEventsHash: z.instanceof(Uint8Array),
  blobsToKeep: z.set(z.string()),
});
export type FinalizationData = z.infer<typeof FinalizationData>;

export class Sessions {
  private db: DatabaseSync;
  private statements: {
    getOrInsertSession: StatementSync;
    addEvent: StatementSync;
    readEvents: StatementSync;
    addBlob: StatementSync;
    getBlob: StatementSync;
    listSessions: StatementSync;
    finalizeSession: StatementSync;
    clearEvents: StatementSync;
    clearBlobsExcept: StatementSync;
  };

  constructor(sqlitePath: string) {
    this.db = new DatabaseSync(sqlitePath);
    this.db.exec("PRAGMA foreign_keys = on;");
    migrateDb(this.db);
    this.statements = {
      getOrInsertSession: this.db.prepare(
        "INSERT INTO sessions (name) VALUES (?) ON CONFLICT (name) DO UPDATE SET name = name RETURNING id, finalized;",
      ),
      addEvent: this.db.prepare("INSERT INTO events (session, data) VALUES (?, ?);"),
      readEvents: this.db.prepare(
        "SELECT data FROM events LEFT JOIN sessions ON events.session = sessions.id WHERE sessions.name = ? ORDER BY events.id;",
      ),
      addBlob: this.db.prepare("INSERT INTO blobs (session, name, data) VALUES (?, ?, ?);"),
      getBlob: this.db.prepare(
        "SELECT data FROM blobs LEFT JOIN sessions ON blobs.session = sessions.id WHERE sessions.name = ? AND blobs.name = ?;",
      ),
      listSessions: this.db.prepare("SELECT name, finalized FROM sessions ORDER BY id;"),
      finalizeSession: this.db.prepare(
        "INSERT INTO sessions (name, finalized) VALUES (?, TRUE) ON CONFLICT (name) DO UPDATE SET finalized = TRUE",
      ),
      clearEvents: this.db.prepare(
        "DELETE FROM events WHERE events.session IN (SELECT id FROM sessions WHERE sessions.name = ?);",
      ),
      clearBlobsExcept: this.db.prepare(
        "DELETE FROM blobs WHERE blobs.session IN (SELECT id FROM sessions WHERE sessions.name = ?) AND blobs.name NOT IN (SELECT name FROM json_each(?));",
      ),
    };
  }

  addEvent(session: string, event: Uint8Array) {
    const row = this.statements.getOrInsertSession.get(session)!;
    const id = row.id as number;
    const finalized = Boolean(row.finalized as number);
    if (finalized) throw "session finalized";
    this.statements.addEvent.run(id, event);
  }

  events(session: string): Uint8Array[] {
    const rows = this.statements.readEvents.all(session);
    return rows.map((row) => row.data as Uint8Array);
  }

  addBlob(session: string, blob: string, data: Uint8Array) {
    const row = this.statements.getOrInsertSession.get(session)!;
    const id = row.id as number;
    const finalized = Boolean(row.finalized as number);
    if (finalized) {
      throw "session finalized";
    }
    try {
      this.statements.addBlob.run(id, blob, data);
    } catch (e) {
      if ((e as any).errstr === "constraint failed") {
        throw "conflict";
      }
      throw e;
    }
  }

  blob(session: string, blob: string): Uint8Array | undefined {
    return this.statements.getBlob.get(session, blob)?.data as Uint8Array | undefined;
  }

  sessions(): { session: string; finalized: boolean }[] {
    return this.statements.listSessions
      .all()
      .map((row) => ({ session: row.name as string, finalized: Boolean(row.finalized as number) }));
  }

  isFinalized(session: string): boolean {
    const { finalized } = this.statements.getOrInsertSession.get(session)!;
    return Boolean(finalized);
  }

  finalize(session: string, data: FinalizationData) {
    if (this.isFinalized(session)) throw "session finalized";
    const id = this.statements.getOrInsertSession.get(session)!.id as number;
    const events = this.events(session);
    const serverExistingEventsHash = sha256(encoder.encode(events));
    if (data.existingEventsHash.toHex() !== serverExistingEventsHash.toHex()) {
      throw "existing events hash mismatch";
    }

    this.db.exec("BEGIN TRANSACTION;");
    try {
      this.statements.clearEvents.run(session);
      this.statements.clearBlobsExcept.run(session, JSON.stringify(Array.from(data.blobsToKeep)));
      for (const event of data.events) {
        this.statements.addEvent.run(id, event);
      }
      this.statements.finalizeSession.run(session);
      this.db.exec("COMMIT;");
    } catch (e) {
      this.db.exec("ROLLBACK;");
      throw e;
    }
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
  const version = (getPragmaStmt.get()!.user_version as number | undefined) ?? 0;
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
