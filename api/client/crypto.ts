import type { Bytes } from "@biko-jobs/api-client";
import { mpDecoder, mpEncoder } from "@biko-jobs/api-client/messagepack.ts";

const textEncoder = new TextEncoder();

export type Plaintext = { type: "plaintext"; data: Bytes };
export type Ciphertext = { type: "ciphertext"; data: Bytes };

export type Fingerprint = string;

export class KeyDerivationPassword {
  key: CryptoKey;
  private constructor(fields: { key: CryptoKey }) {
    this.key = fields.key;
  }
  static async import(password: string) {
    const key = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return new KeyDerivationPassword({ key });
  }
}

export type Salt = { type: "salt"; data: Bytes };
export class AESKey {
  key: CryptoKey;
  fingerprint: Fingerprint;
  private constructor(fields: { key: CryptoKey; fingerprint: Fingerprint }) {
    this.key = fields.key;
    this.fingerprint = fields.fingerprint;
  }

  private static async fromCryptoKey(key: CryptoKey): Promise<AESKey> {
    const keyBytes = await crypto.subtle.exportKey("raw", key);
    const fingerprintBuf = await crypto.subtle.digest("SHA-512", keyBytes);
    const fingerprint = new Uint8Array(fingerprintBuf).toHex();
    return new AESKey({ key, fingerprint });
  }

  static async generate() {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    return AESKey.fromCryptoKey(key);
  }

  static async derive(password: KeyDerivationPassword, salt: Salt) {
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-512",
        salt: salt.data,
        iterations: 1000,
      },
      password.key,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    return AESKey.fromCryptoKey(key);
  }

  async encryptKey(masterKey: RSAPublicKey): Promise<Ciphertext> {
    const rawKey: Plaintext = {
      type: "plaintext",
      data: new Uint8Array(await crypto.subtle.exportKey("raw", this.key)),
    };
    return masterKey.encrypt(rawKey);
  }

  static async decryptKey(masterKey: RSAPrivateKey, key: Ciphertext): Promise<AESKey> {
    const decrypted = await masterKey.decrypt(key);
    const imported = await crypto.subtle.importKey("raw", decrypted.data, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
    return AESKey.fromCryptoKey(imported);
  }

  async decrypt(ct: Ciphertext): Promise<Plaintext> {
    const [iv, encrypted] = mpDecoder.decode(ct.data) as [Bytes, Bytes];
    const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.key, encrypted);
    return { type: "plaintext", data: new Uint8Array(buf) };
  }

  async encrypt(pt: Plaintext): Promise<Ciphertext> {
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, pt.data);
    const encoded = mpEncoder.encode([iv, new Uint8Array(encrypted)]);
    return { type: "ciphertext", data: encoded };
  }
}

export class RSAPublicKey {
  key: CryptoKey;
  fingerprint: Fingerprint;
  private constructor(fields: { key: CryptoKey; fingerprint: Fingerprint }) {
    this.key = fields.key;
    this.fingerprint = fields.fingerprint;
  }

  static async fromCryptoKey(key: CryptoKey) {
    const keyBytes = await crypto.subtle.exportKey("spki", key);
    const fingerprintBuf = await crypto.subtle.digest("SHA-256", keyBytes);
    const fingerprint = new Uint8Array(fingerprintBuf).toHex();
    return new RSAPublicKey({ key, fingerprint });
  }

  static async import(data: Bytes) {
    const key = await crypto.subtle.importKey(
      "spki",
      data,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["encrypt"],
    );
    return RSAPublicKey.fromCryptoKey(key);
  }

  async encrypt(pt: Plaintext): Promise<Ciphertext> {
    const buf = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, this.key, pt.data);
    return { type: "ciphertext", data: new Uint8Array(buf) };
  }

  async export(): Promise<Bytes> {
    return new Uint8Array(await crypto.subtle.exportKey("spki", this.key));
  }
}

export type EncryptedPrivateKey = { type: "encrypted private key"; salt: Salt; key: Ciphertext };

export class RSAPrivateKey {
  key: CryptoKey;
  constructor(fields: { key: CryptoKey }) {
    this.key = fields.key;
  }

  static async import(encryptedPrivateKey: EncryptedPrivateKey, password: KeyDerivationPassword) {
    const encryptionKey = await AESKey.derive(password, encryptedPrivateKey.salt);
    const rawPrivateKey = await encryptionKey.decrypt(encryptedPrivateKey.key);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      rawPrivateKey.data,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      false,
      ["decrypt"],
    );
    return new RSAPrivateKey({ key: privateKey });
  }

  async decrypt(ct: Ciphertext): Promise<Plaintext> {
    const buf = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, this.key, ct.data);
    return { type: "plaintext", data: new Uint8Array(buf) };
  }

  async export(password: KeyDerivationPassword): Promise<EncryptedPrivateKey> {
    const salt: Salt = { type: "salt", data: crypto.getRandomValues(new Uint8Array(16)) };
    const encryptionKey = await AESKey.derive(password, salt);
    const privkeyBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", this.key));
    const key = await encryptionKey.encrypt({
      type: "plaintext",
      data: privkeyBytes,
    });
    return { type: "encrypted private key", salt, key };
  }
}

export async function generateRSAKeyPair(): Promise<{
  publicKey: RSAPublicKey;
  privateKey: RSAPrivateKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const publicKey = await RSAPublicKey.fromCryptoKey(keyPair.publicKey);
  return {
    publicKey,
    privateKey: new RSAPrivateKey({ key: keyPair.privateKey }),
  };
}
