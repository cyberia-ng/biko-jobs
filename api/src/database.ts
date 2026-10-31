import {
  generateECDSAKeyPair,
  generateX25519KeyPair,
  KeyDerivationPassword,
} from "@biko-jobs/api-client/crypto.ts";
import type {
  JobEvent,
  Job,
  JobList,
  JobUUIDs,
  MasterKey,
  JobEvents,
  Bytes,
  JobBlob,
} from "@biko-jobs/api-client/schemas.ts";
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
        encryption_public_key,
        encryption_private_key_encrypted,
        encryption_private_key_encryption_salt,
        signing_public_key,
        signing_private_key_encrypted,
        signing_private_key_encryption_salt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    ),
    listMasterKeys: db.prepare(
      `SELECT
        id,
        name,
        uuid,
        encryption_public_key,
        encryption_private_key_encrypted,
        encryption_private_key_encryption_salt,
        signing_public_key,
        signing_private_key_encrypted,
        signing_private_key_encryption_salt
      FROM master_keys;`,
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

  async registerInitialMasterKey(name: string, password: string) {
    const kdfPassword = await KeyDerivationPassword.import(password);
    const encryptionKeyPair = await generateX25519KeyPair("master key");
    const encryptionKeyPrivate = await encryptionKeyPair.privateKey.export(kdfPassword);
    const signingKeyPair = await generateECDSAKeyPair();
    const signingKeyPrivate = await signingKeyPair.privateKey.export(kdfPassword);
    this.addMasterKey({
      uuid: crypto.randomUUID(),
      name,
      encryptionKey: {
        public: await encryptionKeyPair.publicKey.export(),
        privateEncrypted: encryptionKeyPrivate.key.data,
        salt: encryptionKeyPrivate.salt.data,
      },
      signingKey: {
        public: await signingKeyPair.publicKey.export(),
        privateEncrypted: signingKeyPrivate.key.data,
        salt: signingKeyPrivate.salt.data,
      },
    });
  }

  addMasterKey(key: MasterKey): void {
    try {
      this.statements.insertMasterKey.run(
        key.uuid,
        key.name,
        key.encryptionKey.public,
        key.encryptionKey.privateEncrypted,
        key.encryptionKey.salt,
        key.signingKey.public,
        key.signingKey.privateEncrypted,
        key.signingKey.salt,
      );
    } catch (e) {
      if ((e as any).errstr === "constraint failed") {
        throw "already exists";
      } else throw e;
    }
  }

  listMasterKeys(): MasterKey[] {
    const rows = this.statements.listMasterKeys.all();
    return rows.map((row) => ({
      name: row.name as string,
      uuid: row.uuid as string,
      encryptionKey: {
        public: row.encryption_public_key as Bytes,
        privateEncrypted: row.encryption_private_key_encrypted as Bytes,
        salt: row.encryption_private_key_encryption_salt as Bytes,
      },
      signingKey: {
        public: row.signing_public_key as Bytes,
        privateEncrypted: row.signing_private_key_encrypted as Bytes,
        salt: row.signing_private_key_encryption_salt as Bytes,
      },
    }));
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
