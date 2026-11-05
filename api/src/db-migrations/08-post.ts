import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { DatabaseSync } from "node:sqlite";
import {
  AESKey,
  ScryptPassword,
  X25519PrivateKey,
  X25519PublicKey,
} from "@biko-jobs/api-client/crypto.ts";

type Bytes = Uint8Array<ArrayBuffer>;

export async function dataMigration8Post(db: DatabaseSync) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const selectMasterKeys = db.prepare(
      `SELECT
        id,
        name,
        password_salt,
        password_hardness,
        encryption_public_key,
        encryption_private_key_encrypted
      FROM master_keys;`,
    );
    const selectStreamKeysByMasterKey = db.prepare(
      `SELECT
        stream,
        encrypted_stream_key,
        streams.uuid as stream_uuid
      FROM stream_keys
      LEFT JOIN streams ON stream_keys.stream = streams.id
      WHERE master_key = ?;`,
    );
    const updateStreamKey = db.prepare(
      `UPDATE stream_keys SET encrypted_stream_key = ?
      WHERE master_key = ? AND stream = ?;`,
    );
    const masterKeyRows = selectMasterKeys.all();
    for (const {
      id: masterKeyId,
      name: masterKeyName,
      password_salt: passwordSalt,
      password_hardness: passwordHardness,
      encryption_public_key: publicKey,
      encryption_private_key_encrypted: privateEncrypted,
    } of masterKeyRows) {
      const password = await rl.question(`Password for master key "${masterKeyName as string}": `);
      const kdfPassword = await ScryptPassword.derive(
        password,
        { type: "salt", data: passwordSalt as Bytes },
        passwordHardness as number,
      );
      let encryptionPrivKey: X25519PrivateKey;
      try {
        encryptionPrivKey = await X25519PrivateKey.import(
          {
            type: "ciphertext",
            data: privateEncrypted as Bytes,
          },
          kdfPassword,
        );
      } catch (_e) {
        console.error("Bad password");
        process.exit(1);
      }
      const encryptionPubKey = await X25519PublicKey.import(publicKey as Bytes);
      const streamKeyRows = selectStreamKeysByMasterKey.all(masterKeyId as number);
      for (const { stream: streamId, encrypted_stream_key, stream_uuid } of streamKeyRows) {
        const streamKey = await AESKey.decryptKey(
          encryptionPrivKey,
          {
            type: "ciphertext",
            data: encrypted_stream_key as Bytes,
          },
          `job key/${stream_uuid as string}`,
        );
        const newEncryptedStreamKey = await streamKey.encryptKey(
          encryptionPubKey,
          `stream key/${stream_uuid as string}`,
        );
        updateStreamKey.run(newEncryptedStreamKey.data, masterKeyId as number, streamId as number);
      }
    }
  } finally {
    rl.close();
  }
}
