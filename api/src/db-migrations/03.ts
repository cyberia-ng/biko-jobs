import type { DatabaseSync } from "node:sqlite";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { mpDecoder } from "@biko-jobs/api-client/messagepack.ts";
import {
  AESKey,
  generateECDSAKeyPair,
  generateX25519KeyPair,
  KeyDerivationPassword,
} from "@biko-jobs/api-client/crypto.ts";

export async function dataMigration3(db: DatabaseSync) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const masterKeyName = await rl.question("New master key name: ");
    const masterKeyPasswordText = await rl.question("New master key password: ");
    const masterKeyPassword = await KeyDerivationPassword.import(masterKeyPasswordText);
    const masterKeyX25519 = await generateX25519KeyPair("master key");
    const masterKeyX25519PrivateEncrypted =
      await masterKeyX25519.privateKey.export(masterKeyPassword);
    const masterKeyECDSA = await generateECDSAKeyPair();
    const masterKeyECDSAPrivateEncrypted =
      await masterKeyECDSA.privateKey.export(masterKeyPassword);
    const insertMasterKey = db.prepare(
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id;`,
    );
    const masterKeyId = insertMasterKey.get(
      crypto.randomUUID(),
      masterKeyName,
      await masterKeyX25519.publicKey.export(),
      masterKeyX25519PrivateEncrypted.key.data,
      masterKeyX25519PrivateEncrypted.salt.data,
      await masterKeyECDSA.publicKey.export(),
      masterKeyECDSAPrivateEncrypted.key.data,
      masterKeyECDSAPrivateEncrypted.salt.data,
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
      const sessionKey = await legacyAESKey(passwordText, session.salt);
      const eventsEncrypted = getEvents.all(session.id) as Array<{ data: Uint8Array<ArrayBuffer> }>;
      const eventsEncoded = await Promise.all(
        eventsEncrypted.map((e) => legacyAESDecrypt(sessionKey, e.data)),
      );
      const jobKeys = new Map<number, AESKey>();
      for (const eventEncoded of eventsEncoded) {
        const event = mpDecoder.decode(eventEncoded) as any;
        const jobUUID = event.event.uuid;
        const jobId = insertJob.get(jobUUID)!.id as number;
        let jobKey = jobKeys.get(jobId);
        if (jobKey === undefined) {
          jobKey = await AESKey.generate();
          const encryptedJobKey = await jobKey.encryptKey(masterKeyX25519.publicKey);
          jobKeys.set(jobId, jobKey);
          insertJobKey.run(jobId, masterKeyId, encryptedJobKey.data);
        }
        const eventEncryptedData = await jobKey.encrypt({ type: "plaintext", data: eventEncoded });
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
          const blob = await legacyAESDecrypt(sessionKey, blobEncryptedOld);
          const blobEncryptedNew = await jobKey.encrypt({ type: "plaintext", data: blob });
          insertBlob.run(jobId, blobId, blobEncryptedNew.data);
        }
      }
    }
  } finally {
    rl.close();
  }
}

async function legacyAESKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const kdfKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-512",
      salt: salt,
      iterations: 1000,
    },
    kdfKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  return key;
}

async function legacyAESDecrypt(key: CryptoKey, encrypted: Uint8Array<ArrayBuffer>) {
  const [iv, encryptedData] = mpDecoder.decode(encrypted) as [
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>,
  ];
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedData);
  return new Uint8Array(buf);
}
