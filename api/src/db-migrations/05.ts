import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { DatabaseSync } from "node:sqlite";
import * as oldCrypto from "./05-crypto-old.ts";
import * as newCrypto from "./05-crypto-new.ts";

type Bytes = Uint8Array<ArrayBuffer>;

export async function dataMigration5(db: DatabaseSync) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const selectMasterKeys = db.prepare(
      `SELECT
        id,
        name,
        encryption_private_key_encrypted,
        encryption_private_key_encryption_salt
      FROM master_keys;`,
    );
    const selectJobKeysByMasterKey = db.prepare(
      `SELECT
        job,
        encrypted_job_key,
        jobs.uuid as job_uuid
      FROM job_keys
      LEFT JOIN jobs ON job_keys.job = jobs.id
      WHERE master_key = ?;`,
    );
    const insertNewMasterKey = db.prepare(
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
    const insertJobKey = db.prepare(
      `INSERT INTO job_keys (job, master_key, encrypted_job_key)
      VALUES (?, ?, ?);`,
    );
    const deleteJobKeysByMasterKeyId = db.prepare(
      `DELETE FROM job_keys
      WHERE master_key = ?;`,
    );
    const deleteMasterKey = db.prepare(
      `DELETE FROM master_keys
      WHERE id = ?;`,
    );
    const renameMasterKey = db.prepare(
      `UPDATE master_keys
      SET name = ?
      WHERE id = ?;`,
    );
    const masterKeyRows = selectMasterKeys.all();
    for (const {
      id: oldMasterKeyId,
      name: masterKeyName,
      encryption_private_key_encrypted: privateEncrypted,
      encryption_private_key_encryption_salt: salt,
    } of masterKeyRows) {
      const oldPassword = await rl.question(
        `Password for master key "${masterKeyName as string}": `,
      );
      const oldKDFPassword = await oldCrypto.KeyDerivationPassword.import(oldPassword);
      let oldEncryptionPrivKey: oldCrypto.X25519PrivateKey;
      try {
        oldEncryptionPrivKey = await oldCrypto.X25519PrivateKey.import(
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
      const newEncryptionKeyPair = await newCrypto.generateX25519KeyPair();
      const newSigningKeyPair = await newCrypto.generateEd25519KeyPair();
      const newPassword = await rl.question(
        `New password for master key "${masterKeyName as string}": `,
      );
      const newEncryptionPrivKeyEncrypted =
        await newEncryptionKeyPair.privateKey.export(newPassword);
      const newSigningPrivKeyEncrypted = await newSigningKeyPair.privateKey.export(newPassword);
      const newKeyUUID = crypto.randomUUID();
      const { id: newMasterKeyId } = insertNewMasterKey.get(
        newKeyUUID,
        masterKeyName + "-new",
        await newEncryptionKeyPair.publicKey.export(),
        newEncryptionPrivKeyEncrypted.key.data,
        newEncryptionPrivKeyEncrypted.salt.data,
        await newSigningKeyPair.publicKey.export(),
        newSigningPrivKeyEncrypted.key.data,
        newSigningPrivKeyEncrypted.salt.data,
      )!;

      const jobKeyRows = selectJobKeysByMasterKey.all(oldMasterKeyId as number);
      for (const { job: jobId, encrypted_job_key, job_uuid } of jobKeyRows) {
        const jobKey = await oldCrypto.AESKey.decryptKey(oldEncryptionPrivKey, {
          type: "ciphertext",
          data: encrypted_job_key as Bytes,
        });
        const rawJobKey = await jobKey.trustedExport();
        const newJobKey = await newCrypto.AESKey.import(rawJobKey);
        const newEncryptedJobKey = await newJobKey.encryptKey(
          newEncryptionKeyPair.publicKey,
          `job key/${job_uuid as string}`,
        );
        insertJobKey.run(jobId as number, newMasterKeyId as number, newEncryptedJobKey.data);
      }
      deleteJobKeysByMasterKeyId.run(oldMasterKeyId as number);
      deleteMasterKey.run(oldMasterKeyId as number);
      renameMasterKey.run(masterKeyName as string, newMasterKeyId as number);
    }
  } finally {
    rl.close();
  }
}
