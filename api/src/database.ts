import type {
  JobEvent,
  Job,
  JobList,
  JobUUIDs,
  MasterKey,
  JobEvents,
  Bytes,
  JobBlob,
  MasterKeyPublic,
} from "@biko-jobs/api-client/schemas.ts";
import { timingSafeEqual } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inspect } from "node:util";

function statements(db: DatabaseSync) {
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
    insertJob: db.prepare(
      `INSERT INTO jobs (uuid)
      VALUES (?) RETURNING id;`,
    ),
    insertJobKey: db.prepare(
      `INSERT INTO job_keys (job, master_key, encrypted_job_key)
      VALUES (?, ?, ?);`,
    ),
    getJobs: db.prepare(
      `SELECT
        jobs.id AS job_number,
        jobs.uuid AS uuid,
        job_keys.encrypted_job_key AS encrypted_job_key,
        master_keys.uuid AS master_key_uuid
      FROM jobs
      LEFT JOIN job_keys ON jobs.id = job_keys.job
      LEFT JOIN master_keys ON job_keys.master_key = master_keys.id;`,
    ),
    getEvents: db.prepare(
      `SELECT
        jobs.uuid AS job_uuid,
        job_events.uuid AS event_uuid,
        job_events.data AS event_data
      FROM jobs
      LEFT JOIN job_events ON jobs.id = job_events.job
      WHERE jobs.uuid IN (SELECT value FROM json_each(?))
      ORDER BY job_events.id;`,
    ),
    insertEvent: db.prepare(
      `INSERT INTO job_events (job, uuid, data)
      SELECT id, ?, ? FROM jobs WHERE jobs.uuid = ?;`,
    ),
    insertBlob: db.prepare(
      `INSERT INTO job_blobs (job, uuid, data)
      SELECT id, ?, ? FROM jobs WHERE jobs.uuid = ?;`,
    ),
    getBlob: db.prepare(`SELECT data FROM job_blobs WHERE uuid = ?;`),
    getMasterSigningKey: db.prepare(`SELECT signing_public_key FROM master_keys WHERE uuid = ?;`),
  };
}

export class Database {
  private db: DatabaseSync;
  private statements: ReturnType<typeof statements>;

  constructor(sqlitePath?: string) {
    if (sqlitePath === undefined) {
      this.db = new DatabaseSync(":memory:");
      migrateDb(this.db, {}).catch(console.error);
    } else {
      this.db = new DatabaseSync(sqlitePath);
      if (!dbIsFullyMigrated(this.db)) {
        throw new Error("File-backed database must be fully migrated");
      }
    }

    this.statements = statements(this.db);
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

  addJob(job: Job): number {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const jobId = this.statements.insertJob.get(job.uuid)!.id as number;
      const masterKeys = this.statements.listMasterKeys.all() as Array<{
        id: number;
        uuid: string;
      }>;
      if (masterKeys.length !== job.keys.size) {
        throw "key mismatch";
      }
      for (const masterKey of masterKeys) {
        const jobKey = job.keys.get(masterKey.uuid);
        if (jobKey === undefined) {
          throw "key mismatch";
        }
        this.statements.insertJobKey.run(jobId, masterKey.id, jobKey);
      }
      this.db.exec("COMMIT;");
      return jobId;
    } catch (e) {
      this.db.exec("ROLLBACK;");
      if ((e as any).errstr === "constraint failed") {
        throw "already exists";
      } else throw e;
    }
  }

  getEventsByJobs(jobs: JobUUIDs): JobEvents {
    const rows = this.statements.getEvents.all(JSON.stringify(Array.from(jobs)));
    return rows.map((row) => ({
      job: row.job_uuid as string,
      uuid: row.event_uuid as string,
      data: row.event_data as Bytes,
    }));
  }

  getJobs(): JobList {
    const jobs = new Map<string, { number: number; keys: Map<string, Bytes> }>();
    const rows = this.statements.getJobs.all();
    for (const row of rows) {
      const uuid = row.uuid as string;
      let jobData = jobs.get(uuid);
      if (jobData === undefined) {
        jobData = { number: row.job_number as number, keys: new Map() };
        jobs.set(uuid, jobData);
      }
      jobData.keys.set(row.master_key_uuid as string, row.encrypted_job_key as Bytes);
    }
    return Array.from(jobs.entries().map(([uuid, { number, keys }]) => ({ number, uuid, keys })));
  }

  addEvent(event: JobEvent) {
    try {
      this.statements.insertEvent.run(event.uuid, event.data, event.job);
    } catch (e) {
      if ((e as any).errstr === "constraint failed") {
        throw "already exists";
      } else throw e;
    }
  }

  addBlob(blob: JobBlob) {
    try {
      this.statements.insertBlob.run(blob.uuid, blob.data, blob.job);
    } catch (e) {
      if ((e as any).errstr === "constraint failed") {
        throw "already exists";
      } else throw e;
    }
  }

  getBlob(uuid: string): Bytes | undefined {
    const row = this.statements.getBlob.get(uuid);
    return row?.data as Bytes | undefined;
  }

  getMasterSigningKey(uuid: string): Bytes | undefined {
    const row = this.statements.getMasterSigningKey.get(uuid);
    if (row === undefined) return undefined;
    return row.signing_public_key as Bytes;
  }
}

export async function migrateDb(
  db: DatabaseSync,
  dataMigrations: Record<number, (db: DatabaseSync) => Promise<void>>,
) {
  db.exec("PRAGMA foreign_keys = on;");
  const version = dbVersion(db);
  const migrations = getMigrations();
  for (const migration of migrations) {
    if (migration.num <= version) continue;
    db.exec("BEGIN TRANSACTION;");
    try {
      db.exec(migration.migration);
      db.exec(`PRAGMA user_version = ${migration.num};`);
      const dataMigration = dataMigrations[migration.num];
      if (dataMigration !== undefined) {
        await dataMigration(db);
      }
      db.exec("COMMIT;");
    } catch (e) {
      db.exec("ROLLBACK;");
      throw new Error(`migration failed: ${migration.filename}; ${inspect(e)}`);
    }
  }
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
