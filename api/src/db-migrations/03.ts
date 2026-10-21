import type { DatabaseSync } from "node:sqlite";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { mpDecoder } from "@biko-jobs/api-client/messagepack.ts";
import { AESKey, generateRSAKeyPair, KeyDerivationPassword } from "@biko-jobs/api-client/crypto.ts";

export async function dataMigration3(db: DatabaseSync) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const masterKeyName = await rl.question("New master key name: ");
    const masterKeyPasswordText = await rl.question("New master key password: ");
    const masterKeyPassword = await KeyDerivationPassword.import(masterKeyPasswordText);
    const masterKey = await generateRSAKeyPair();
    const masterKeyEncrypted = await masterKey.privateKey.export(masterKeyPassword);
    const insertMasterKey = db.prepare(
      `INSERT INTO master_keys (name, fingerprint, salt, public_key, encrypted_private_key)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id;`,
    );
    const masterKeyId = insertMasterKey.get(
      masterKeyName,
      masterKey.publicKey.fingerprint,
      masterKeyEncrypted.salt.data,
      await masterKey.publicKey.export(),
      masterKeyEncrypted.key.data,
    )!.id as number;

    const getEvents = db.prepare(`SELECT data FROM events WHERE session = ?;`);
    const insertJob = db.prepare(
      `INSERT INTO jobs (uuid)
      VALUES (?)
      ON CONFLICT DO UPDATE SET uuid = uuid
      RETURNING id;`,
    );
    const insertJobKey = db.prepare(
      `INSERT INTO job_keys (job, master_key, encrypted_job_key)
      VALUES (?, ?, ?);`,
    );
    const insertEvent = db.prepare(
      `INSERT INTO job_events (job, uuid, data)
      VALUES (?, ?, ?);`,
    );
    const getBlob = db.prepare(`SELECT data FROM blobs WHERE session = ? AND name = ?;`);
    const insertBlob = db.prepare(
      `INSERT INTO job_blobs (job, uuid, data)
      VALUES (?, ?, ?);`,
    );

    const getSessions = db.prepare(
      `SELECT
        sessions.id, sessions.name, blobs.data AS salt
      FROM sessions
      LEFT JOIN blobs ON blobs.session = sessions.id
      WHERE blobs.name = 'salt';`,
    );
    const rows = getSessions.all() as Array<{
      id: number;
      name: string;
      salt: Uint8Array<ArrayBuffer>;
    }>;
    const seenBlobIds = new Set<string>();
    for (const session of rows) {
      const passwordText = await rl.question(`Password for session ${session.name}: `);
      const password = await KeyDerivationPassword.import(passwordText);
      const sessionKey = await AESKey.derive(password, { type: "salt", data: session.salt });
      const eventsEncrypted = getEvents.all(session.id) as Array<{ data: Uint8Array<ArrayBuffer> }>;
      const eventsEncoded = await Promise.all(
        eventsEncrypted.map((e) => sessionKey.decrypt({ type: "ciphertext", data: e.data })),
      );
      const jobKeys = new Map<number, AESKey>();
      for (const eventEncoded of eventsEncoded) {
        const event = mpDecoder.decode(eventEncoded.data) as any;
        const jobUUID = event.event.uuid;
        const jobId = insertJob.get(jobUUID)!.id as number;
        let jobKey = jobKeys.get(jobId);
        if (jobKey === undefined) {
          jobKey = await AESKey.generate();
          const encryptedJobKey = await jobKey.encryptKey(masterKey.publicKey);
          jobKeys.set(jobId, jobKey);
          insertJobKey.run(jobId, masterKeyId, encryptedJobKey.data);
        }
        const eventEncryptedData = await jobKey.encrypt(eventEncoded);
        const eventUUID = crypto.randomUUID();
        insertEvent.run(jobId, eventUUID, eventEncryptedData.data);

        const blobIds: Array<string> = event.event.images?.map((i: any) => i.blobId) ?? [];
        for (const blobId of blobIds) {
          if (seenBlobIds.has(blobId)) continue;
          seenBlobIds.add(blobId);
          if (blobId === "salt") continue;
          const row = getBlob.get(session.id, blobId);
          if (row === undefined) continue;
          const blobEncryptedOld = row.data as Uint8Array<ArrayBuffer>;
          const blob = await sessionKey.decrypt({ type: "ciphertext", data: blobEncryptedOld });
          const blobEncryptedNew = await jobKey.encrypt(blob);
          insertBlob.run(jobId, blobId, blobEncryptedNew.data);
        }
      }
    }
  } finally {
    rl.close();
  }
}
