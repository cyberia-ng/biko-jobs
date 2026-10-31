import type { Bytes } from "@biko-jobs/api-client";
import {
  AES_LENGTH,
  AESKey,
  Ed25519PrivateKey,
  Ed25519PublicKey,
  generateEd25519KeyPair,
  generateX25519KeyPair,
  ScryptPassword,
  X25519PrivateKey,
  X25519PublicKey,
  type Plaintext,
  type Salt,
} from "@biko-jobs/api-client/crypto.ts";
import { describe, expect, test } from "vitest";

describe("crypto", () => {
  function utf8(s: string): Bytes {
    return new Uint8Array(Buffer.from(s, "utf8"));
  }
  const plaintext: Plaintext = { type: "plaintext", data: utf8("hello world") };
  const toBeSigned = utf8("hello world");

  describe("scrypt", () => {
    test("produces same data on same input", async () => {
      const salt: Salt = { type: "salt", data: crypto.getRandomValues(new Uint8Array(16)) };
      const scryptA = await ScryptPassword.derive("password", salt);
      const hkdfA = await scryptA.hkdf("some context", 256);
      const scryptB = await ScryptPassword.derive("password", salt);
      const hkdfB = await scryptB.hkdf("some context", 256);
      expect(hkdfA).toStrictEqual(hkdfB);
    });

    test("hkdf has right length", async () => {
      const salt: Salt = { type: "salt", data: crypto.getRandomValues(new Uint8Array(16)) };
      const scrypt = await ScryptPassword.derive("password", salt);
      const hkdf = await scrypt.hkdf("some context", 256);
      expect(hkdf.data).toHaveLength(256 / 8);
    });
  });

  describe("aes", () => {
    test("encrypt/decrypt round trip with import", async () => {
      const rawKey = crypto.getRandomValues(new Uint8Array(AES_LENGTH / 8));
      const key = await AESKey.import({ type: "unencrypted key material", data: rawKey });
      expect(await key.decrypt(await key.encrypt(plaintext))).toStrictEqual(plaintext);
    });

    test("encrypt/decrypt round trip with generate", async () => {
      const key = await AESKey.generate();
      expect(await key.decrypt(await key.encrypt(plaintext))).toStrictEqual(plaintext);
    });

    test("encrypted key", async () => {
      const masterKeyPair = await generateX25519KeyPair();
      const key = await AESKey.generate();
      const encryptedKey = await key.encryptKey(masterKeyPair.publicKey, "some aes key");
      const roundtripped = await AESKey.decryptKey(
        masterKeyPair.privateKey,
        encryptedKey,
        "some aes key",
      );
      expect(await roundtripped.decrypt(await key.encrypt(plaintext))).toStrictEqual(plaintext);
      expect(await key.decrypt(await roundtripped.encrypt(plaintext))).toStrictEqual(plaintext);
    });

    test("encryption of same plaintext does not produce identical ciphertexts", async () => {
      const key = await AESKey.generate();
      expect(await key.encrypt(plaintext)).not.toStrictEqual(await key.encrypt(plaintext));
    });
  });

  describe("ed25519", () => {
    test("sign/verify round trip", async () => {
      const key = await generateEd25519KeyPair();
      expect(await key.publicKey.verify(await key.privateKey.sign(toBeSigned))).toStrictEqual(
        toBeSigned,
      );
    });

    test("import/export public key", async () => {
      const key = await generateEd25519KeyPair();
      const exported = await key.publicKey.export();
      const roundtripped = await Ed25519PublicKey.import(exported);
      expect(await roundtripped.verify(await key.privateKey.sign(toBeSigned))).toStrictEqual(
        toBeSigned,
      );
    });

    test("import/export private key", async () => {
      const key = await generateEd25519KeyPair();
      const exported = await key.privateKey.export("password");
      const roundtripped = await Ed25519PrivateKey.import(exported, "password");
      expect(await key.publicKey.verify(await roundtripped.sign(toBeSigned))).toStrictEqual(
        toBeSigned,
      );
    });
  });

  describe("x25519", () => {
    test("encrypt/decrypt round trip", async () => {
      const keyPair = await generateX25519KeyPair();
      expect(
        await keyPair.privateKey.decrypt(
          await keyPair.publicKey.encrypt(plaintext, "some context"),
          "some context",
        ),
      ).toStrictEqual(plaintext);
    });

    test("import/export public key", async () => {
      const key = await generateX25519KeyPair();
      const exported = await key.publicKey.export();
      const roundtripped = await X25519PublicKey.import(exported);
      expect(
        await key.privateKey.decrypt(
          await roundtripped.encrypt(plaintext, "some context"),
          "some context",
        ),
      ).toStrictEqual(plaintext);
    });

    test("import/export private key", async () => {
      const key = await generateX25519KeyPair();
      const exported = await key.privateKey.export("password");
      const roundtripped = await X25519PrivateKey.import(exported, "password");
      expect(
        await roundtripped.decrypt(
          await key.publicKey.encrypt(plaintext, "some context"),
          "some context",
        ),
      ).toStrictEqual(plaintext);
    });
  });
});
