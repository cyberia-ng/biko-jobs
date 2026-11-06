import type {
  StreamEvent,
  StreamList,
  MasterKey,
  StreamEvents,
  Bytes,
  MasterKeyPublic,
  StreamKeys,
} from "@biko-jobs/api-client/schemas.ts";
import { timingSafeEqual } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inspect } from "node:util";

function prepareStatements(db: DatabaseSync) {
  return {
    insertMasterKey: db.prepare(
      `INSERT INTO master_keys (
        uuid,
        name,
        password_salt,
        password_hash,
        password_hardness,
        encryption_public_key,
        encryption_private_key_encrypted,
        signing_public_key,
        signing_private_key_encrypted
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    ),
    listMasterKeys: db.prepare(
      `SELECT
        id,
        name,
        uuid,
        password_salt,
        password_hardness,
        encryption_public_key,
        signing_public_key
      FROM master_keys;`,
    ),
    getMasterKey: db.prepare(
      `SELECT
        name,
        password_salt,
        password_hash,
        password_hardness,
        encryption_public_key,
        encryption_private_key_encrypted,
        signing_public_key,
        signing_private_key_encrypted
      FROM master_keys
      WHERE uuid = ?;`,
    ),
    insertStream: db.prepare(
      `INSERT INTO streams (name)
      VALUES (?) RETURNING number;`,
    ),
    insertStreamKey: db.prepare(
      `INSERT INTO stream_keys (stream, master_key, encrypted_stream_key)
      VALUES (?, ?, ?);`,
    ),
    getStreams: db.prepare(
      `SELECT
        streams.number AS stream_number,
        streams.name AS stream_name,
        stream_keys.encrypted_stream_key AS encrypted_stream_key,
        master_keys.uuid AS master_key_uuid
      FROM streams
      LEFT JOIN stream_keys ON streams.number = stream_keys.stream
      LEFT JOIN master_keys ON stream_keys.master_key = master_keys.id;`,
    ),
    getEvents: db.prepare(
      `SELECT
        streams.name AS stream_name,
        stream_events.uuid AS event_uuid,
        stream_events.data AS event_data
      FROM streams
      LEFT JOIN stream_events ON streams.number = stream_events.stream
      WHERE streams.number IN (SELECT value FROM json_each(?))
      ORDER BY stream_events.id;`,
    ),
    insertEvent: db.prepare(
      `INSERT INTO stream_events (stream, uuid, data)
      SELECT number, ?, ? FROM streams WHERE streams.name = ?;`,
    ),
    getMasterSigningKey: db.prepare(`SELECT signing_public_key FROM master_keys WHERE uuid = ?;`),
  };
}

export class Database {
  private db: DatabaseSync;
  private statements: ReturnType<typeof prepareStatements>;

  private constructor(db: DatabaseSync, statements: ReturnType<typeof prepareStatements>) {
    this.db = db;
    this.statements = statements;
  }

  static async init(sqlitePath: string | undefined) {
    let db: DatabaseSync;
    if (sqlitePath === undefined) {
      db = new DatabaseSync(":memory:");
      await migrateDb(db, {});
    } else {
      db = new DatabaseSync(sqlitePath);
      if (!dbIsFullyMigrated(db)) {
        throw new Error("File-backed database must be fully migrated");
      }
    }
    return new Database(db, prepareStatements(db));
  }

  addMasterKey(key: MasterKey): void {
    try {
      this.statements.insertMasterKey.run(
        key.uuid,
        key.name,
        key.passwordSalt,
        key.passwordHash,
        key.passwordHardness,
        key.encryptionKeyPublic,
        key.encryptionKeyPrivateEncrypted,
        key.signingKeyPublic,
        key.signingKeyPrivateEncrypted,
      );
    } catch (e) {
      if ((e as any).errstr === "constraint failed") {
        throw "already exists";
      } else throw e;
    }
  }

  listMasterKeys(): MasterKeyPublic[] {
    const rows = this.statements.listMasterKeys.all();
    return rows.map((row) => ({
      name: row.name as string,
      uuid: row.uuid as string,
      passwordSalt: row.password_salt as Bytes,
      passwordHardness: row.password_hardness as number,
      encryptionKeyPublic: row.encryption_public_key as Bytes,
      signingKeyPublic: row.signing_public_key as Bytes,
    }));
  }

  getMasterKey(uuid: string, hash: Bytes): MasterKey | undefined {
    const row = this.statements.getMasterKey.get(uuid);
    if (row === undefined) throw "not found";
    if (!timingSafeEqual(row.password_hash as Bytes, hash)) {
      throw "bad hash";
    }
    return {
      uuid: uuid,
      name: row.name as string,
      passwordSalt: row.password_salt as Bytes,
      passwordHash: hash,
      passwordHardness: row.password_hardness as number,
      encryptionKeyPublic: row.encryption_public_key as Bytes,
      encryptionKeyPrivateEncrypted: row.encryption_private_key_encrypted as Bytes,
      signingKeyPublic: row.signing_public_key as Bytes,
      signingKeyPrivateEncrypted: row.signing_private_key_encrypted as Bytes,
    };
  }

  addStream(name: string, keys: StreamKeys): number {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const streamNumber = this.statements.insertStream.get(name)!.number as number;
      const masterKeys = this.statements.listMasterKeys.all() as Array<{
        id: number;
        uuid: string;
      }>;
      if (masterKeys.length !== keys.size) {
        throw "key mismatch";
      }
      for (const masterKey of masterKeys) {
        const streamKey = keys.get(masterKey.uuid);
        if (streamKey === undefined) {
          throw "key mismatch";
        }
        this.statements.insertStreamKey.run(streamNumber, masterKey.id, streamKey);
      }
      this.db.exec("COMMIT;");
      return streamNumber;
    } catch (e) {
      this.db.exec("ROLLBACK;");
      if ((e as any).errstr === "constraint failed") {
        throw "already exists";
      } else throw e;
    }
  }

  getEventsByStreams(streamNumbers: Set<number>): StreamEvents {
    const rows = this.statements.getEvents.all(JSON.stringify(Array.from(streamNumbers)));
    const events: StreamEvent[] = [];
    const emptyStreams: Set<string> = new Set();
    for (const { stream_name, event_uuid, event_data } of rows) {
      if (event_uuid === null || event_data === null) {
        emptyStreams.add(stream_name as string);
      } else {
        events.push({
          stream: stream_name as string,
          uuid: event_uuid as string,
          data: event_data as Bytes,
        });
      }
    }
    return { events, emptyStreams };
  }

  getStreams(): StreamList {
    const streams = new Map<string, { number: number; keys: Map<string, Bytes> }>();
    const rows = this.statements.getStreams.all();
    for (const row of rows) {
      const name = row.stream_name as string;
      let streamData = streams.get(name);
      if (streamData === undefined) {
        streamData = {
          number: row.stream_number as number,
          keys: new Map(),
        };
        streams.set(name, streamData);
      }
      streamData.keys.set(row.master_key_uuid as string, row.encrypted_stream_key as Bytes);
    }
    return Array.from(
      streams.entries().map(([name, { number, keys }]) => ({ number, name, keys })),
    );
  }

  addEvent(event: StreamEvent) {
    try {
      this.statements.insertEvent.run(event.uuid, event.data, event.stream);
    } catch (e) {
      if ((e as any).errstr === "constraint failed") {
        throw "already exists";
      } else throw e;
    }
  }

  getMasterSigningKey(uuid: string): Bytes | undefined {
    const row = this.statements.getMasterSigningKey.get(uuid);
    if (row === undefined) return undefined;
    return row.signing_public_key as Bytes;
  }
}

export async function migrateDb(
  db: DatabaseSync,
  dataMigrations: Record<
    number,
    { pre?: (db: DatabaseSync) => Promise<void>; post?: (db: DatabaseSync) => Promise<void> }
  >,
) {
  db.exec("PRAGMA foreign_keys = on;");
  const version = dbVersion(db);
  const migrations = getMigrations();
  for (const migration of migrations) {
    if (migration.num <= version) continue;
    const dataMigration = dataMigrations[migration.num];
    db.exec("BEGIN TRANSACTION;");
    try {
      await dataMigration?.pre?.(db);
      db.exec(migration.migration);
      db.exec(`PRAGMA user_version = ${migration.num};`);
      await dataMigration?.post?.(db);
      db.exec("COMMIT;");
    } catch (e) {
      db.exec("ROLLBACK;");
      throw new Error(`migration failed: ${migration.filename}; ${inspect(e)}`);
    }
  }
  db.exec("VACUUM;");
}

function getMigrations() {
  const migrationsDir = join(import.meta.dirname, "db-migrations");
  const migrationsFilenames = readdirSync(migrationsDir);
  const migrations = migrationsFilenames
    .flatMap((filename) => {
      const match = filename.match(/^(\d+)(-.*)?\.sql$/);
      if (match === null) {
        return [];
      }
      const num = parseInt(match[1]!, 10);
      return [{ migration: readFileSync(join(migrationsDir, filename), "utf8"), filename, num }];
    })
    .toSorted(({ num: numA }, { num: numB }) => numA - numB);
  return migrations;
}

function dbVersion(db: DatabaseSync) {
  const getPragmaStmt = db.prepare("PRAGMA user_version;");
  const version = (getPragmaStmt.get()!.user_version as number | undefined) ?? 0;
  return version;
}

export function dbIsFullyMigrated(db: DatabaseSync): boolean {
  const version = dbVersion(db);
  const migrations = getMigrations();
  if (migrations.length === 0) return version === 0;
  return migrations[migrations.length - 1]!.num === version;
}
