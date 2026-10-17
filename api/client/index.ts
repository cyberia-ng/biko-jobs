import type { FinalizationData } from "@biko-jobs/api/sessions.ts";
import { mpEncoder, mpDecoder } from "./messagepack.ts";
import zip from "lodash/zip.js";

export type ClientErrorInfo =
  | { type: "http error"; status: number }
  | { type: "websocket error"; event: Event }
  | { type: "session finalized" }
  | { type: "session finalization events mismatch" };

export class ClientError extends Error {
  session: string | undefined;
  info: ClientErrorInfo;

  constructor(session: string | undefined, info: ClientErrorInfo) {
    let message: string = "";
    if (session !== undefined) {
      message += `[${session}] `;
    }
    switch (info.type) {
      case "http error":
        message += `HTTP Error: status ${info.status}`;
        break;
      case "websocket error":
        message += "WebSocket error";
        break;
      case "session finalized":
        message += "Session was finalized";
        break;
    }
    super(message);
    this.info = info;
    this.session = session;
  }
}

function raiseForStatus(session: string | undefined, res: Response) {
  if (!res.ok) {
    throw new ClientError(session, { type: "http error", status: res.status });
  }
}

export class ApiClient {
  private baseUrl: string;
  private encodedSession: string;
  private key: CryptoKey;
  private ws?: WebSocket;
  private subscribers: Set<(event: unknown) => void>;
  private onWebSocketError: (error: ClientError) => void;

  private constructor(
    baseUrl: string,
    encodedSession: string,
    key: CryptoKey,
    onWebSocketError: (error: ClientError) => void,
  ) {
    this.baseUrl = baseUrl;
    this.encodedSession = encodedSession;
    this.key = key;
    this.onWebSocketError = onWebSocketError;
    this.subscribers = new Set();
    this.refreshWebSocket();
  }

  private raiseForStatus(res: Response, statusMap?: Record<number, ClientErrorInfo>) {
    if (!res.ok) {
      const session = decodeURIComponent(this.encodedSession);
      const info = statusMap?.[res.status];
      if (info !== undefined) {
        throw new ClientError(session, info);
      } else raiseForStatus(session, res);
    }
  }

  static async open(
    baseUrl: string,
    session: string,
    pass: string,
    onWebSocketError?: (error: ClientError) => void,
  ): Promise<ApiClient> {
    const encodedSession = encodeURIComponent(session);
    let salt: Uint8Array<ArrayBuffer> | undefined;
    while (salt === undefined) {
      const saltGetRes = await fetch(`${baseUrl}/session/${encodedSession}/blob/salt`);
      if (saltGetRes.status === 404) {
        salt = crypto.getRandomValues(new Uint8Array(16));
        const saltPutRes = await fetch(`${baseUrl}/session/${encodedSession}/blob/salt`, {
          method: "PUT",
          body: salt,
          headers: { "Content-Type": "application/octet-stream" },
        });
        if (saltPutRes.status === 409) {
          // Salt was uploaded by another client between our GET and our PUT
          salt = undefined;
          continue;
        }
        raiseForStatus(session, saltPutRes);
      } else if (saltGetRes.status === 200) {
        salt = await saltGetRes.bytes();
      } else {
        raiseForStatus(session, saltGetRes);
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
    return new ApiClient(
      baseUrl,
      encodedSession,
      key,
      onWebSocketError ?? console.error.bind(console),
    );
  }

  refreshWebSocket() {
    this.closeWebSocket();
    const wsBaseUrl = this.baseUrl.replace(/^http/, "ws");
    this.ws = new WebSocket(`${wsBaseUrl}/session/${this.encodedSession}/events`);
    this.ws.addEventListener("message", (e) => {
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
    this.ws.addEventListener("error", (event) => {
      this.onWebSocketError(
        new ClientError(decodeURIComponent(this.encodedSession), {
          type: "websocket error",
          event,
        }),
      );
    });
    return this.ws;
  }

  closeWebSocket() {
    this.ws?.close();
  }

  private async encrypt(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, data);
    return mpEncoder.encode([iv, new Uint8Array(encrypted)]);
  }

  private async decrypt(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const [iv, encrypted] = mpDecoder.decode(data) as [
      Uint8Array<ArrayBuffer>,
      Uint8Array<ArrayBuffer>,
    ];
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.key, encrypted),
    );
  }

  private async initializationVectors(): Promise<Uint8Array<ArrayBuffer>[]> {
    const res = await fetch(`${this.baseUrl}/session/${this.encodedSession}/events`);
    this.raiseForStatus(res);
    const body = await res.bytes();
    const rawEvents = mpDecoder.decode(body) as Uint8Array<ArrayBuffer>[];
    const ivs = rawEvents
      .map((data) => mpDecoder.decode(data) as [Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>])
      .map(([iv]) => iv);
    return ivs;
  }

  async events(): Promise<unknown[]> {
    const res = await fetch(`${this.baseUrl}/session/${this.encodedSession}/events`);
    this.raiseForStatus(res);
    const body = await res.bytes();
    const rawEvents = mpDecoder.decode(body) as Uint8Array<ArrayBuffer>[];
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
    const res = await fetch(`${this.baseUrl}/session/${this.encodedSession}/events`, {
      method: "POST",
      body: encrypted,
      headers: { "Content-Type": "application/octet-stream" },
    });
    this.raiseForStatus(res, { 405: { type: "session finalized" } });
  }

  async putBlob(id: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    const encrypted = await this.encrypt(data);
    const res = await fetch(
      `${this.baseUrl}/session/${this.encodedSession}/blob/${encodeURIComponent(id)}`,
      { method: "PUT", body: encrypted, headers: { "Content-Type": "application/octet-stream" } },
    );
    this.raiseForStatus(res, { 405: { type: "session finalized" } });
  }

  async getBlob(id: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
    const res = await fetch(
      `${this.baseUrl}/session/${this.encodedSession}/blob/${encodeURIComponent(id)}`,
    );
    if (res.status === 404) {
      return undefined;
    }
    this.raiseForStatus(res, {});
    const encrypted = await res.bytes();
    return this.decrypt(encrypted);
  }

  subscribeEvents(cb: (event: unknown) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  async finalize(existingEvents: unknown[], replacementEvents: unknown[], blobsToKeep: string[]) {
    const existingIVs = await this.initializationVectors();
    const existingEventsEncrypted = await Promise.all(
      zip(existingIVs, existingEvents).map(async ([iv, event]) => {
        const encoded = mpEncoder.encode(event);
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, encoded);
        return mpEncoder.encode([iv, new Uint8Array(encrypted)]);
      }),
    );
    const existingEventsHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", mpEncoder.encode(existingEventsEncrypted)),
    );
    const events = replacementEvents.map((e) => mpEncoder.encode(e));
    const body: FinalizationData = {
      events,
      blobsToKeep: [...blobsToKeep, "salt"],
      existingEventsHash,
    };
    const res = await fetch(`${this.baseUrl}/session/${this.encodedSession}/finalize`, {
      method: "POST",
      body: mpEncoder.encode(body),
      headers: { "Content-Type": "application/vnd.msgpack" },
    });
    this.raiseForStatus(res, {
      409: { type: "session finalized" },
      422: { type: "session finalization events mismatch" },
    });
  }
}

export async function listSessions(
  baseUrl: string,
): Promise<Array<{ session: string; finalized: boolean }>> {
  const res = await fetch(`${baseUrl}/session`);
  raiseForStatus(undefined, res);
  return res.json();
}
