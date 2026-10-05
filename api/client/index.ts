import { decode, Decoder, Encoder } from "@msgpack/msgpack";

function raiseForStatus(res: Response) {
  if (!res.ok) {
    throw new Error(`HTTP Error: status ${res.status}`);
  }
}

const mpEncoder = new Encoder();
const mpDecoder = new Decoder();

export class ApiClient {
  private baseUrl: string;
  private sessionId: string;
  private key: CryptoKey;

  private constructor(baseUrl: string, sessionId: string, key: CryptoKey) {
    this.baseUrl = baseUrl;
    this.sessionId = sessionId;
    this.key = key;
  }

  static async newSession(baseUrl: string, sessionId: string, pass: string): Promise<ApiClient> {
    const textEncoder = new TextEncoder();
    const passKey = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(pass),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-512",
        salt: Uint8Array.fromBase64("wbmK9MCqN0Rw+Wge5MUN8g=="), // TODO don't hardcode salt
        iterations: 1000,
      },
      passKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const res = await fetch(`${baseUrl}/session/${sessionId}`, { method: "PUT" });
    raiseForStatus(res);
    return new ApiClient(baseUrl, sessionId, key);
  }

  async events(): Promise<unknown[]> {
    const res = await fetch(`${this.baseUrl}/session/${this.sessionId}`);
    if (!res.ok) {
      throw new Error(`HTTP Error: status ${res.status}`);
    }
    const body = await res.bytes();
    const rawEvents = decode(body) as Uint8Array[];
    return (
      await Promise.all(
        rawEvents.map((rawEvent) => {
          const [iv, encrypted] = decode(rawEvent) as [
            Uint8Array<ArrayBuffer>,
            Uint8Array<ArrayBuffer>,
          ];
          return crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.key, encrypted);
        }),
      )
    )
      .map((buf) => new Uint8Array(buf))
      .map((data) => mpDecoder.decode(data));
  }

  async postEvent(event: unknown): Promise<void> {
    const encoded = mpEncoder.encode(event);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, encoded);
    const packed = mpEncoder.encode([iv, new Uint8Array(encrypted)]);
    const res = await fetch(`${this.baseUrl}/session/${this.sessionId}`, {
      method: "POST",
      body: packed,
      headers: { "Content-Type": "application/octet-stream" },
    });
    raiseForStatus(res);
  }
}
