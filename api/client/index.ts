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
  private session: string;
  private key: CryptoKey;
  private ws: WebSocket;
  private subscribers: Set<(event: unknown) => void>;

  private constructor(baseUrl: string, session: string, key: CryptoKey, ws: WebSocket) {
    this.baseUrl = baseUrl;
    this.session = session;
    this.key = key;
    this.ws = ws;
    this.subscribers = new Set();
    ws.addEventListener("message", (e) => {
      (e.data as Blob)
        .bytes()
        .then((data) => this.decrypt(data))
        .then((data) => mpDecoder.decode(data))
        .then((event) => {
          for (const cb of this.subscribers) {
            cb(event);
          }
        });
    });
  }

  static async listSessions(baseUrl: string): Promise<string[]> {
    const res = await fetch(`${baseUrl}/session`);
    return res.json();
  }

  static async open(baseUrl: string, session: string, pass: string): Promise<ApiClient> {
    const encodedSessionId = encodeURIComponent(session);
    let salt: Uint8Array<ArrayBuffer> | undefined;
    while (salt === undefined) {
      const saltGetRes = await fetch(`${baseUrl}/session/${encodedSessionId}/blob/salt`);
      if (saltGetRes.status === 404) {
        salt = crypto.getRandomValues(new Uint8Array(16));
        const saltPutRes = await fetch(`${baseUrl}/session/${encodedSessionId}/blob/salt`, {
          method: "PUT",
          body: salt,
          headers: { "Content-Type": "application/octet-stream" },
        });
        if (saltPutRes.status === 409) {
          // Salt was uploaded by another client between our GET and our PUT
          salt = undefined;
          continue;
        }
        raiseForStatus(saltPutRes);
      } else if (saltGetRes.status === 200) {
        salt = await saltGetRes.bytes();
      } else {
        raiseForStatus(saltGetRes);
      }
    }

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
        salt,
        iterations: 1000,
      },
      passKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const wsBaseUrl = baseUrl.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsBaseUrl}/session/${encodedSessionId}/events`);
    return new ApiClient(baseUrl, encodedSessionId, key, ws);
  }

  private async encrypt(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, data);
    return mpEncoder.encode([iv, new Uint8Array(encrypted)]);
  }

  private async decrypt(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const [iv, encrypted] = decode(data) as [Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>];
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.key, encrypted),
    );
  }

  async events(): Promise<unknown[]> {
    const res = await fetch(`${this.baseUrl}/session/${this.session}/events`);
    if (!res.ok) {
      throw new Error(`HTTP Error: status ${res.status}`);
    }
    const body = await res.bytes();
    const rawEvents = decode(body) as Uint8Array<ArrayBuffer>[];
    return Promise.all(
      rawEvents.map(async (rawEvent) => {
        const decrypted = new Uint8Array(await this.decrypt(rawEvent));
        return mpDecoder.decode(decrypted);
      }),
    );
  }

  async postEvent(event: unknown): Promise<void> {
    const encoded = mpEncoder.encode(event);
    const encrypted = await this.encrypt(encoded);
    const res = await fetch(`${this.baseUrl}/session/${this.session}/events`, {
      method: "POST",
      body: encrypted,
      headers: { "Content-Type": "application/octet-stream" },
    });
    raiseForStatus(res);
  }

  async putBlob(id: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    const encrypted = await this.encrypt(data);
    const res = await fetch(
      `${this.baseUrl}/session/${this.session}/blob/${encodeURIComponent(id)}`,
      { method: "PUT", body: encrypted, headers: { "Content-Type": "application/octet-stream" } },
    );
    raiseForStatus(res);
  }

  async getBlob(id: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
    const res = await fetch(
      `${this.baseUrl}/session/${this.session}/blob/${encodeURIComponent(id)}`,
    );
    if (res.status === 404) {
      return undefined;
    }
    raiseForStatus(res);
    const encrypted = await res.bytes();
    return this.decrypt(encrypted);
  }

  subscribeEvents(cb: (event: unknown) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  closeWebSocket() {
    this.ws.close();
  }
}
