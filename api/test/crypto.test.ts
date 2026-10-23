import type { Bytes } from "@biko-jobs/api-client";
import {
  AESKey,
  ECDSAPrivateKey,
  ECDSAPublicKey,
  generateECDSAKeyPair,
  generateX25519KeyPair,
  KeyDerivationPassword,
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

  describe("aes", () => {
    test("encrypt/decrypt round trip with derive", async () => {
      const kdfPassword = await KeyDerivationPassword.import("password");
      const salt: Salt = { type: "salt", data: crypto.getRandomValues(new Uint8Array(16)) };
      const key = await AESKey.derivePassword(kdfPassword, salt);
      expect(await key.decrypt(await key.encrypt(plaintext))).toStrictEqual(plaintext);
    });

    test("encrypt/decrypt round trip with generate", async () => {
      const key = await AESKey.generate();
      expect(await key.decrypt(await key.encrypt(plaintext))).toStrictEqual(plaintext);
    });

    test("encrypted key", async () => {
      const masterKeyPair = await generateX25519KeyPair("key encryption");
      const key = await AESKey.generate();
      const encryptedKey = await key.encryptKey(masterKeyPair.publicKey);
      const roundtripped = await AESKey.decryptKey(masterKeyPair.privateKey, encryptedKey);
      expect(await roundtripped.decrypt(await key.encrypt(plaintext))).toStrictEqual(plaintext);
      expect(await key.decrypt(await roundtripped.encrypt(plaintext))).toStrictEqual(plaintext);
    });

    test("encryption of same plaintext does not produce identical ciphertexts", async () => {
      const key = await AESKey.generate();
      expect(await key.encrypt(plaintext)).not.toStrictEqual(await key.encrypt(plaintext));
    });
  });

  describe("ecdsa", () => {
    test("sign/verify round trip", async () => {
      const key = await generateECDSAKeyPair();
      expect(await key.publicKey.verify(await key.privateKey.sign(toBeSigned))).toStrictEqual(
        toBeSigned,
      );
    });

    test("import/export public key", async () => {
      const key = await generateECDSAKeyPair();
      const exported = await key.publicKey.export();
      const roundtripped = await ECDSAPublicKey.import(exported);
      expect(await roundtripped.verify(await key.privateKey.sign(toBeSigned))).toStrictEqual(
        toBeSigned,
      );
    });

    test("import/export private key", async () => {
      const key = await generateECDSAKeyPair();
      const kdfPassword = await KeyDerivationPassword.import("password");
      const exported = await key.privateKey.export(kdfPassword);
      const roundtripped = await ECDSAPrivateKey.import(exported, kdfPassword);
      expect(await key.publicKey.verify(await roundtripped.sign(toBeSigned))).toStrictEqual(
        toBeSigned,
      );
    });
  });

  describe("x25519", () => {
    test("encrypt/decrypt round trip", async () => {
      const keyPair = await generateX25519KeyPair("some context");
      expect(
        await keyPair.privateKey.decrypt(await keyPair.publicKey.encrypt(plaintext)),
      ).toStrictEqual(plaintext);
    });

    test("import/export public key", async () => {
      const key = await generateX25519KeyPair("some context");
      const exported = await key.publicKey.export();
      const roundtripped = await X25519PublicKey.import(exported, "some context");
      expect(await key.privateKey.decrypt(await roundtripped.encrypt(plaintext))).toStrictEqual(
        plaintext,
      );
    });

    test("import/export private key", async () => {
      const key = await generateX25519KeyPair("some context");
      const kdfPassword = await KeyDerivationPassword.import("password");
      const exported = await key.privateKey.export(kdfPassword);
      const roundtripped = await X25519PrivateKey.import(exported, kdfPassword, "some context");
      expect(await roundtripped.decrypt(await key.publicKey.encrypt(plaintext))).toStrictEqual(
        plaintext,
      );
    });
  });
});
