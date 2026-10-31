import type { Bytes } from "@biko-jobs/api-client";
import { mpDecoder, mpEncoder } from "@biko-jobs/api-client/messagepack.ts";
import { scryptAsync } from "@noble/hashes/scrypt.js";

const textEncoder = new TextEncoder();

export type Plaintext = { type: "plaintext"; data: Bytes };
export type Ciphertext = { type: "ciphertext"; data: Bytes };
export type UnencryptedKeyMaterial = { type: "unencrypted key material"; data: Bytes };

export const AES_LENGTH = 256;

export type Salt = { type: "salt"; data: Bytes };
export class ScryptPassword {
  private derived: Bytes;
  private salt: Salt;
  private constructor(derived: Bytes, salt: Salt) {
    this.derived = derived;
    this.salt = salt;
  }

  static async derive(password: string, salt: Salt) {
    const bytes = await scryptAsync(password, salt.data, { N: 2 ** 18, r: 8, p: 1 });
    return new ScryptPassword(new Uint8Array(bytes), salt);
  }

  async hkdf(context: string, length: number): Promise<UnencryptedKeyMaterial> {
    const hkdfKey = await crypto.subtle.importKey("raw", this.derived, "HKDF", false, [
      "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: this.salt.data,
        info: textEncoder.encode(context),
      },
      hkdfKey,
      length,
    );
    return { type: "unencrypted key material", data: new Uint8Array(bits) };
  }
}

export class AESKey {
  key: CryptoKey;
  private constructor(key: CryptoKey) {
    this.key = key;
  }

  static async generate() {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: AES_LENGTH }, true, [
      "encrypt",
      "decrypt",
    ]);
    return new AESKey(key);
  }

  async encryptKey(masterKey: X25519PublicKey, context: string): Promise<Ciphertext> {
    const rawKey: Plaintext = {
      type: "plaintext",
      data: new Uint8Array(await crypto.subtle.exportKey("raw", this.key)),
    };
    return masterKey.encrypt(rawKey, context);
  }

  static async decryptKey(
    masterKey: X25519PrivateKey,
    key: Ciphertext,
    context: string,
  ): Promise<AESKey> {
    const decrypted = await masterKey.decrypt(key, context);
    const imported = await crypto.subtle.importKey("raw", decrypted.data, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
    return new AESKey(imported);
  }

  async trustedExport(): Promise<UnencryptedKeyMaterial> {
    return {
      type: "unencrypted key material",
      data: new Uint8Array(await crypto.subtle.exportKey("raw", this.key)),
    };
  }

  static async import(raw: UnencryptedKeyMaterial): Promise<AESKey> {
    if (raw.data.length * 8 !== AES_LENGTH) {
      throw new Error("bad AES key length");
    }
    const key = await crypto.subtle.importKey("raw", raw.data, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
    return new AESKey(key);
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

export class VerificationError extends Error {
  constructor() {
    super("Message verification failed");
  }
}

export class Ed25519PublicKey {
  key: CryptoKey;
  constructor(key: CryptoKey) {
    this.key = key;
  }

  static async import(data: Bytes) {
    const key = await crypto.subtle.importKey(
      "raw",
      data,
      {
        name: "Ed25519",
      },
      true,
      ["verify"],
    );
    return new Ed25519PublicKey(key);
  }

  async verify(signed: SignedData): Promise<Bytes> {
    const success = await crypto.subtle.verify(
      { name: "Ed25519" },
      this.key,
      signed.signature,
      signed.data,
    );
    if (success) return signed.data;
    else throw new VerificationError();
  }

  async export(): Promise<Bytes> {
    return new Uint8Array(await crypto.subtle.exportKey("raw", this.key));
  }
}

export type EncryptedEd25519PrivateKey = {
  type: "encrypted ed25519 private key";
  salt: Salt;
  key: Ciphertext;
};

export type SignedData = {
  data: Bytes;
  signature: Bytes;
};

export class Ed25519PrivateKey {
  key: CryptoKey;
  constructor(key: CryptoKey) {
    this.key = key;
  }

  static async import(encryptedPrivateKey: EncryptedEd25519PrivateKey, password: string) {
    const scryptPassword = await ScryptPassword.derive(password, encryptedPrivateKey.salt);
    const encryptionKey = await AESKey.import(
      await scryptPassword.hkdf("ed25519 key encryption", AES_LENGTH),
    );
    const rawPrivateKey = await encryptionKey.decrypt(encryptedPrivateKey.key);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      rawPrivateKey.data,
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    return new Ed25519PrivateKey(privateKey);
  }

  async sign(data: Bytes): Promise<SignedData> {
    const signature = await crypto.subtle.sign({ name: "Ed25519" }, this.key, data);
    return { data, signature: new Uint8Array(signature) };
  }

  async export(password: string): Promise<EncryptedEd25519PrivateKey> {
    const salt: Salt = { type: "salt", data: crypto.getRandomValues(new Uint8Array(16)) };
    const scryptPassword = await ScryptPassword.derive(password, salt);
    const encryptionKey = await AESKey.import(
      await scryptPassword.hkdf("ed25519 key encryption", AES_LENGTH),
    );
    const privkeyBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", this.key));
    const key = await encryptionKey.encrypt({
      type: "plaintext",
      data: privkeyBytes,
    });
    return { type: "encrypted ed25519 private key", salt, key };
  }
}

export async function generateEd25519KeyPair(): Promise<{
  publicKey: Ed25519PublicKey;
  privateKey: Ed25519PrivateKey;
}> {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  return {
    publicKey: new Ed25519PublicKey(keyPair.publicKey),
    privateKey: new Ed25519PrivateKey(keyPair.privateKey),
  };
}

export class X25519PublicKey {
  key: CryptoKey;
  fingerprint: string;
  constructor(opts: { key: CryptoKey; fingerprint: string }) {
    this.key = opts.key;
    this.fingerprint = opts.fingerprint;
  }

  async encrypt(pt: Plaintext, context: string): Promise<Ciphertext> {
    const ephemeralKeyPair = await generateX25519KeyPair();
    const sharedBits = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "X25519", public: this.key },
        ephemeralKeyPair.privateKey.key,
        AES_LENGTH,
      ),
    );
    const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveBits"]);
    const salt: Salt = { type: "salt", data: crypto.getRandomValues(new Uint8Array(16)) };
    const hkdfBits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: salt.data,
        info: textEncoder.encode(context),
      },
      hkdfKey,
      AES_LENGTH,
    );
    const aesKey = await AESKey.import({
      type: "unencrypted key material",
      data: new Uint8Array(hkdfBits),
    });
    const encrypted = await aesKey.encrypt(pt);
    const packed = mpEncoder.encode([
      await ephemeralKeyPair.publicKey.export(),
      salt.data,
      encrypted.data,
    ]);
    return { type: "ciphertext", data: packed };
  }

  async export(): Promise<Bytes> {
    return new Uint8Array(await crypto.subtle.exportKey("raw", this.key));
  }

  static async import(bytes: Bytes): Promise<X25519PublicKey> {
    const key = await crypto.subtle.importKey("raw", bytes, { name: "X25519" }, true, []);
    const fingerprint = await fingerprintX25519PublicKey(key);
    return new X25519PublicKey({ key, fingerprint });
  }
}

async function fingerprintX25519PublicKey(key: CryptoKey): Promise<string> {
  const bytes = await crypto.subtle.exportKey("raw", key);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(hash).toHex();
}

export type EncryptedX25519PrivateKey = {
  type: "encrypted x25519 private key";
  salt: Salt;
  key: Ciphertext;
};

export class X25519PrivateKey {
  key: CryptoKey;
  constructor(key: CryptoKey) {
    this.key = key;
  }

  async decrypt(ct: Ciphertext, context: string): Promise<Plaintext> {
    const [publicKeyData, saltData, encrypted] = mpDecoder.decode(ct.data) as [Bytes, Bytes, Bytes];
    const publicKey = await X25519PublicKey.import(publicKeyData);
    const sharedBits = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "X25519", public: publicKey.key },
        this.key,
        AES_LENGTH,
      ),
    );
    const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveBits"]);
    const hkdfBits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: saltData,
        info: textEncoder.encode(context),
      },
      hkdfKey,
      AES_LENGTH,
    );
    const aesKey = await AESKey.import({
      type: "unencrypted key material",
      data: new Uint8Array(hkdfBits),
    });
    return aesKey.decrypt({ type: "ciphertext", data: encrypted });
  }

  static async import(encryptedPrivateKey: EncryptedX25519PrivateKey, password: string) {
    const scryptPassword = await ScryptPassword.derive(password, encryptedPrivateKey.salt);
    const rawAESKey = await scryptPassword.hkdf("x25519 key encryption", AES_LENGTH);
    const encryptionKey = await AESKey.import(rawAESKey);
    const rawPrivateKey = await encryptionKey.decrypt(encryptedPrivateKey.key);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      rawPrivateKey.data,
      {
        name: "X25519",
      },
      false,
      ["deriveBits"],
    );
    return new X25519PrivateKey(privateKey);
  }

  async export(password: string): Promise<EncryptedX25519PrivateKey> {
    const salt: Salt = { type: "salt", data: crypto.getRandomValues(new Uint8Array(16)) };
    const scryptPassword = await ScryptPassword.derive(password, salt);
    const encryptionKey = await AESKey.import(
      await scryptPassword.hkdf("x25519 key encryption", AES_LENGTH),
    );
    const privkeyBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", this.key));
    const key = await encryptionKey.encrypt({
      type: "plaintext",
      data: privkeyBytes,
    });
    return { type: "encrypted x25519 private key", salt, key };
  }
}

export async function generateX25519KeyPair(): Promise<{
  publicKey: X25519PublicKey;
  privateKey: X25519PrivateKey;
}> {
  const keyPair = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
  const fingerprint = await fingerprintX25519PublicKey(keyPair.publicKey);
  return {
    publicKey: new X25519PublicKey({ key: keyPair.publicKey, fingerprint }),
    privateKey: new X25519PrivateKey(keyPair.privateKey),
  };
}
