import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { DatabaseSync } from "node:sqlite";
import { mpDecoder } from "@biko-jobs/api-client/messagepack.ts";
import {
  AESKey,
  KeyDerivationPassword,
  X25519PrivateKey,
} from "@biko-jobs/api/db-migrations/05-crypto-old.ts";
import { generateX25519KeyPair } from "@biko-jobs/api-client/crypto.ts";

type Bytes = Uint8Array<ArrayBuffer>;

export async function dataMigration5(db: DatabaseSync) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const selectMasterKeys = db.prepare(`
      SELECT
        id,
        name,
        encryption_private_key_encrypted,
        encryption_private_key_encryption_salt
      FROM master_keys;
    `);
    const selectJobsByMasterKey = db.prepare(`
      SELECT
        id,
        encrypted_job_key
      FROM job_keys
      WHERE master_key = ?
    `);
    const masterKeyRows = selectMasterKeys.all();
    for (const {
      id: masterKeyId,
      name,
      encryption_private_key_encrypted: privateEncrypted,
      encryption_private_key_encryption_salt: salt,
    } of masterKeyRows) {
      const oldPassword = await rl.question(`Password for master key ${name}: `);
      const oldKDFPassword = await KeyDerivationPassword.import(oldPassword);
      let oldEncryptionPrivKey: X25519PrivateKey;
      try {
        oldEncryptionPrivKey = await X25519PrivateKey.import(
          {
            type: "encrypted x25519 private key",
            salt: { type: "salt", data: salt as Bytes },
            key: { type: "ciphertext", data: privateEncrypted as Bytes },
          },
          oldKDFPassword,
          "master key",
        );
      } catch (_e) {
        console.error("Bad password");
        process.exit(1);
      }
      const newEncryptionKeyPair = await generateX25519KeyPair("master key");
      const newPassword = await rl.question(`New password for master key ${name}: `);
      const newPrivKeyEncrypted = await newEncryptionKeyPair.privateKey.export({
        type: "key derivation password",
        data: newPassword,
      });
      const jobKeyRows = selectJobsByMasterKey.all(masterKeyId as number);
      for (const { id: jobKeyId, encrypted_job_key } of jobKeyRows) {
        const jobKey = await AESKey.decryptKey(oldEncryptionPrivKey, {
          type: "ciphertext",
          data: encrypted_job_key as Bytes,
        });
        const newEncryptedJobKey = await jobKey.encryptKey(newEncryptionKeyPair.publicKey);
      }
      // TODO: blobs
      // TODO: update data
    }
  } finally {
    rl.close();
  }
  throw new Error("bad");
}
