import type { Bytes } from "@biko-jobs/api-client";
import { mpDecoder, mpEncoder } from "@biko-jobs/api-client/messagepack.ts";

const textEncoder = new TextEncoder();

export type Plaintext = { type: "plaintext"; data: Bytes };
export type Ciphertext = { type: "ciphertext"; data: Bytes };

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

export class KeyDerivationBits {
  key: CryptoKey;
  private constructor(key: CryptoKey) {
    this.key = key;
  }
  static async import(data: Bytes) {
    const key = await crypto.subtle.importKey("raw", data, "HKDF", false, ["deriveKey"]);
    return new KeyDerivationBits(key);
  }
}

export type Salt = { type: "salt"; data: Bytes };
export class AESKey {
  key: CryptoKey;
  private constructor(key: CryptoKey) {
    this.key = key;
  }

  static async generate() {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    return new AESKey(key);
  }

  static async derivePassword(password: KeyDerivationPassword, salt: Salt) {
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: salt.data,
        iterations: 1000,
      },
      password.key,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    return new AESKey(key);
  }

  static async deriveBits(bits: KeyDerivationBits, salt: Salt, context: string) {
    const key = await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: salt.data, info: textEncoder.encode(context) },
      bits.key,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    return new AESKey(key);
  }

  async encryptKey(masterKey: X25519PublicKey): Promise<Ciphertext> {
    const rawKey: Plaintext = {
      type: "plaintext",
      data: new Uint8Array(await crypto.subtle.exportKey("raw", this.key)),
    };
    return masterKey.encrypt(rawKey);
  }

  static async decryptKey(masterKey: X25519PrivateKey, key: Ciphertext): Promise<AESKey> {
    const decrypted = await masterKey.decrypt(key);
    const imported = await crypto.subtle.importKey("raw", decrypted.data, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
    return new AESKey(imported);
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

export type SignedData = { data: Bytes; signature: Bytes };

export class VerificationError extends Error {
  constructor() {
    super("Message verification failed");
  }
}

export class ECDSAPublicKey {
  key: CryptoKey;
  constructor(key: CryptoKey) {
    this.key = key;
  }

  static async import(data: Bytes) {
    const key = await crypto.subtle.importKey(
      "raw",
      data,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true,
      ["verify"],
    );
    return new ECDSAPublicKey(key);
  }

  async verify(signed: SignedData): Promise<Bytes> {
    const success = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
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

export type EncryptedECDSAPrivateKey = {
  type: "encrypted ecdsa private key";
  salt: Salt;
  key: Ciphertext;
};

export class ECDSAPrivateKey {
  key: CryptoKey;
  constructor(key: CryptoKey) {
    this.key = key;
  }

  static async import(
    encryptedPrivateKey: EncryptedECDSAPrivateKey,
    password: KeyDerivationPassword,
  ) {
    const encryptionKey = await AESKey.derivePassword(password, encryptedPrivateKey.salt);
    const rawPrivateKey = await encryptionKey.decrypt(encryptedPrivateKey.key);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      rawPrivateKey.data,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false,
      ["sign"],
    );
    return new ECDSAPrivateKey(privateKey);
  }

  async sign(data: Bytes): Promise<SignedData> {
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.key, data);
    return { data, signature: new Uint8Array(signature) };
  }

  async export(password: KeyDerivationPassword): Promise<EncryptedECDSAPrivateKey> {
    const salt: Salt = { type: "salt", data: crypto.getRandomValues(new Uint8Array(16)) };
    const encryptionKey = await AESKey.derivePassword(password, salt);
    const privkeyBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", this.key));
    const key = await encryptionKey.encrypt({
      type: "plaintext",
      data: privkeyBytes,
    });
    return { type: "encrypted ecdsa private key", salt, key };
  }
}

export async function generateECDSAKeyPair(): Promise<{
  publicKey: ECDSAPublicKey;
  privateKey: ECDSAPrivateKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"],
  );
  return {
    publicKey: new ECDSAPublicKey(keyPair.publicKey),
    privateKey: new ECDSAPrivateKey(keyPair.privateKey),
  };
}

export class X25519PublicKey {
  key: CryptoKey;
  context: string;
  constructor(opts: { key: CryptoKey; context: string }) {
    this.key = opts.key;
    this.context = opts.context;
  }

  async encrypt(pt: Plaintext): Promise<Ciphertext> {
    const ephemeralKeyPair = await generateX25519KeyPair("");
    const sharedBits = await crypto.subtle.deriveBits(
      { name: "X25519", public: this.key },
      ephemeralKeyPair.privateKey.key,
      256,
    );
    const hkdfKey = await KeyDerivationBits.import(new Uint8Array(sharedBits));
    const salt: Salt = { type: "salt", data: crypto.getRandomValues(new Uint8Array(16)) };
    const aesKey = await AESKey.deriveBits(hkdfKey, salt, this.context);
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

  static async import(bytes: Bytes, context: string): Promise<X25519PublicKey> {
    const key = await crypto.subtle.importKey("raw", bytes, { name: "X25519" }, true, []);
    return new X25519PublicKey({ key, context });
  }
}

export type EncryptedX25519PrivateKey = {
  type: "encrypted x25519 private key";
  salt: Salt;
  key: Ciphertext;
};

export class X25519PrivateKey {
  key: CryptoKey;
  context: string;
  constructor(opts: { key: CryptoKey; context: string }) {
    this.key = opts.key;
    this.context = opts.context;
  }

  async decrypt(ct: Ciphertext): Promise<Plaintext> {
    const [publicKeyData, saltData, encrypted] = mpDecoder.decode(ct.data) as [Bytes, Bytes, Bytes];
    const publicKey = await X25519PublicKey.import(publicKeyData, this.context);
    const sharedBits = await crypto.subtle.deriveBits(
      { name: "X25519", public: publicKey.key },
      this.key,
      256,
    );
    const hkdfKey = await KeyDerivationBits.import(new Uint8Array(sharedBits));
    const aesKey = await AESKey.deriveBits(hkdfKey, { type: "salt", data: saltData }, this.context);
    return aesKey.decrypt({ type: "ciphertext", data: encrypted });
  }

  static async import(
    encryptedPrivateKey: EncryptedX25519PrivateKey,
    password: KeyDerivationPassword,
    context: string,
  ) {
    const encryptionKey = await AESKey.derivePassword(password, encryptedPrivateKey.salt);
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
    return new X25519PrivateKey({ key: privateKey, context });
  }

  async export(password: KeyDerivationPassword): Promise<EncryptedX25519PrivateKey> {
    const salt: Salt = { type: "salt", data: crypto.getRandomValues(new Uint8Array(16)) };
    const encryptionKey = await AESKey.derivePassword(password, salt);
    const privkeyBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", this.key));
    const key = await encryptionKey.encrypt({
      type: "plaintext",
      data: privkeyBytes,
    });
    return { type: "encrypted x25519 private key", salt, key };
  }
}

export async function generateX25519KeyPair(context: string): Promise<{
  publicKey: X25519PublicKey;
  privateKey: X25519PrivateKey;
}> {
  const keyPair = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
  return {
    publicKey: new X25519PublicKey({ key: keyPair.publicKey, context }),
    privateKey: new X25519PrivateKey({ key: keyPair.privateKey, context }),
  };
}
