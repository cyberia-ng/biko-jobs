import { assertNever } from "@biko-jobs/api-client/assert-never.ts";
import {
  AESKey,
  Ed25519PrivateKey,
  Ed25519PublicKey,
  generateEd25519KeyPair,
  generateX25519KeyPair,
  KeyDerivationPassword,
  X25519PrivateKey,
  X25519PublicKey,
  type EncryptedEd25519PrivateKey,
  type EncryptedX25519PrivateKey,
} from "@biko-jobs/api-client/crypto.ts";
import { mpDecoder, mpEncoder } from "@biko-jobs/api-client/messagepack.ts";
import type { Bytes } from "@biko-jobs/api-client/schemas.ts";
import * as schemas from "@biko-jobs/api-client/schemas.ts";
import groupBy from "lodash/groupBy.js";
import pick from "lodash/pick.js";
import { z } from "zod";

export type { Bytes } from "@biko-jobs/api-client/schemas.ts";

export type ClientErrorInfo =
  | { type: "http error"; status: number }
  | { type: "websocket error"; event: Event }
  | { type: "job put conflict"; uuid: string }
  | { type: "blob put conflict"; uuid: string }
  | { type: "duplicate event"; uuid: string }
  | { type: "job keys incomplete" }
  | { type: "master key post conflict"; name: string; uuid: string }
  | { type: "not authorized" };

export class ClientError extends Error {
  info: ClientErrorInfo;

  constructor(info: ClientErrorInfo) {
    let message: string = `[${info.type}]`;
    switch (info.type) {
      case "http error":
        message += ` status ${info.status}`;
        break;
      case "websocket error":
      case "job keys incomplete":
      case "not authorized":
        break;
      case "job put conflict":
      case "blob put conflict":
      case "duplicate event":
        message += ` ${info.uuid}`;
        break;
      case "master key post conflict":
        message += `${info.uuid} (${info.name})`;
        break;
      default:
        assertNever(info);
    }
    super(message);
    this.info = info;
  }
}

function raiseForStatus(res: { ok: boolean; status: number }) {
  if (!res.ok) {
    if (res.status === 401) throw new ClientError({ type: "not authorized" });
    throw new ClientError({ type: "http error", status: res.status });
  }
}

async function apiFetch(
  baseUrl: string,
  endpointComponents: string[],
  options?: {
    method?: RequestInit["method"];
    body?: unknown;
    query?: Record<string, string>;
    auth?: AuthToken;
  },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const endpoint = endpointComponents.map((c) => encodeURIComponent(c)).join("/");
  const fetchOptions: RequestInit = {};
  if (options?.method !== undefined) fetchOptions.method = options.method;
  if (options?.body !== undefined) {
    fetchOptions.body = mpEncoder.encode(options.body);
    fetchOptions.headers = { "Content-Type": "application/vnd.msgpack" };
  }
  let url = `${baseUrl}/${endpoint}`;
  if (options?.query !== undefined) {
    let firstQueryParam = true;
    for (const [param, value] of Object.entries(options.query)) {
      url += firstQueryParam ? "?" : "&";
      url += encodeURIComponent(param);
      url += "=";
      url += encodeURIComponent(value);
      firstQueryParam = false;
    }
  }
  if (options?.auth !== undefined) {
    fetchOptions.headers = fetchOptions.headers ?? {};
    Object.assign(fetchOptions.headers, { Authorization: options.auth.tokenStr });
  }
  const res = await fetch(url, fetchOptions);
  const bodyBytes = await res.bytes();
  let body: unknown = undefined;
  if (res.headers.get("Content-Type") === "application/vnd.msgpack") {
    body = mpDecoder.decode(bodyBytes);
  } else {
    body = bodyBytes;
  }
  return { ...pick(res, ["ok", "status"]), body };
}

type WebSocketSubscriber = {
  getJob: (uuid: string) => Job | undefined;
  getMasterKey: (uuid: string) => MasterKeyPair | undefined;
  onConnect: () => void;
  onEvent: (event: SubscriptionEvent) => void;
  onError: (error: unknown) => void;
};

export class ApiClient {
  private baseUrl: string;
  private ws: WebSocket | undefined;
  private subscribers: Set<WebSocketSubscriber>;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.subscribers = new Set();
  }

  async listMasterKeys(): Promise<MasterKeyPublic[]> {
    const res = await apiFetch(this.baseUrl, ["master-keys"]);
    raiseForStatus(res);
    const body = z.array(schemas.MasterKey).parse(res.body);
    return Promise.all(body.map((k) => MasterKeyPublic.fromWireFormat(k)));
  }

  async addMasterKeyPair(keyPair: MasterKeyPair, auth: AuthToken): Promise<void> {
    const res = await apiFetch(this.baseUrl, ["master-keys"], {
      method: "POST",
      body: await keyPair.toWireFormat(),
      auth,
    });
    if (res.status === 409) {
      throw new ClientError({
        type: "master key post conflict",
        uuid: keyPair.uuid,
        name: keyPair.name,
      });
    }
    raiseForStatus(res);
  }

  async addJob(job: Job, access: MasterKeyPublic[], auth: AuthToken): Promise<NumberedJob> {
    const encryptedJobKeysArrayP = access.map(
      async (mkp) => [mkp.uuid, (await job.key.encryptKey(mkp.encryptionPublicKey)).data] as const,
    );
    const encryptedJobKeys = new Map(await Promise.all(encryptedJobKeysArrayP));
    const body: schemas.Job = {
      uuid: job.uuid,
      keys: encryptedJobKeys,
    };
    const res = await apiFetch(this.baseUrl, ["jobs", body.uuid], {
      method: "PUT",
      body,
      auth,
    });
    switch (res.status) {
      case 409:
        throw new ClientError({ type: "job put conflict", uuid: body.uuid });
      case 422:
        throw new ClientError({ type: "job keys incomplete" });
    }
    raiseForStatus(res);
    return job.withNumber(z.number().parse(res.body));
  }

  async getJobs(masterKey: MasterKeyPair): Promise<Array<NumberedJob>> {
    const res = await apiFetch(this.baseUrl, ["jobs"], {
      method: "GET",
    });
    raiseForStatus(res);
    const body = schemas.JobList.parse(res.body);
    const jobsP = body.map(async ({ uuid, keys, number }) => {
      const encryptedKey = keys.get(masterKey.uuid)!;
      const key = await AESKey.decryptKey(masterKey.encryptionPrivateKey, {
        type: "ciphertext",
        data: encryptedKey,
      });
      return new NumberedJob(uuid, key, number);
    });
    return Promise.all(jobsP);
  }

  async getEventsByJobs(jobs: Job[]): Promise<Map<string, JobEvent[]>> {
    const requestBody: schemas.JobUUIDs = new Set(jobs.map((job) => job.uuid));
    const res = await apiFetch(this.baseUrl, ["events", "by-jobs"], {
      method: "POST",
      body: requestBody,
    });
    raiseForStatus(res);
    const responseBody = schemas.JobEvents.parse(res.body);
    const jobsMap = new Map(jobs.map((job) => [job.uuid, job]));
    const eventPs = responseBody.map(async (event) => {
      const job = jobsMap.get(event.job)!;
      const decrypted = await job.key.decrypt({ type: "ciphertext", data: event.data });
      const decoded = mpDecoder.decode(decrypted.data);
      return { uuid: event.uuid, data: decoded, job } satisfies JobEvent;
    });
    const events = await Promise.all(eventPs);
    const jobsEventsDict = groupBy(events, (event) => event.job.uuid);
    return new Map(Object.entries(jobsEventsDict));
  }

  async addEvent(event: JobEvent, auth: AuthToken) {
    const encoded = mpEncoder.encode(event.data);
    const encrypted = await event.job.key.encrypt({ type: "plaintext", data: encoded });
    const res = await apiFetch(this.baseUrl, ["events"], {
      method: "POST",
      body: {
        job: event.job.uuid,
        uuid: event.uuid,
        data: encrypted.data,
      } satisfies schemas.JobEvent,
      auth,
    });
    if (res.status === 409) throw new ClientError({ type: "duplicate event", uuid: event.uuid });
    raiseForStatus(res);
  }

  async putBlob(blob: JobBlob, auth: AuthToken) {
    const encrypted = await blob.job.key.encrypt({ type: "plaintext", data: blob.data });
    const res = await apiFetch(this.baseUrl, ["blobs"], {
      method: "POST",
      body: { job: blob.job.uuid, uuid: blob.uuid, data: encrypted.data } satisfies schemas.JobBlob,
      auth,
    });
    if (res.status === 409) throw new ClientError({ type: "blob put conflict", uuid: blob.uuid });
    raiseForStatus(res);
  }

  async getBlob(uuid: string, job: Job): Promise<JobBlob | undefined> {
    const res = await apiFetch(this.baseUrl, ["blobs", uuid]);
    if (res.status === 404) {
      return undefined;
    }
    raiseForStatus(res);
    const body = schemas.Bytes.parse(res.body);
    const decrypted = await job.key.decrypt({ type: "ciphertext", data: body });
    return { uuid, data: decrypted.data, job };
  }

  private async eventsSocketMessageHandler(msgEvent: MessageEvent<Blob>) {
    const data = await msgEvent.data.bytes();
    const decoded = mpDecoder.decode(data);
    const socketEvent = schemas.SocketEvent.parse(decoded);
    for (const subscriber of this.subscribers) {
      switch (socketEvent.type) {
        case "new job":
          {
            let jobKey: AESKey | undefined = undefined;
            for (const [masterKeyUUID, encryptedJobKey] of socketEvent.job.keys.entries()) {
              const mk = subscriber.getMasterKey(masterKeyUUID);
              if (mk === undefined) continue;
              jobKey = await AESKey.decryptKey(mk.encryptionPrivateKey, {
                type: "ciphertext",
                data: encryptedJobKey,
              });
              break;
            }
            if (jobKey === undefined) continue;
            const job = new NumberedJob(socketEvent.job.uuid, jobKey, socketEvent.job.number);
            subscriber.onEvent({ type: "new job", job });
          }
          break;
        case "job event":
          {
            const job = subscriber.getJob(socketEvent.event.job);
            if (job === undefined) continue;
            const decrypted = await job.key.decrypt({
              type: "ciphertext",
              data: socketEvent.event.data,
            });
            const decoded = mpDecoder.decode(decrypted.data);
            subscriber.onEvent({
              type: "job event",
              event: { uuid: socketEvent.event.uuid, data: decoded, job },
            });
          }
          break;
        default:
          assertNever(socketEvent);
      }
    }
  }

  syncSocketState() {
    if (this.subscribers.size === 0) {
      if (this.ws === undefined || this.ws.readyState === WebSocket.CLOSED) {
        this.ws = undefined;
        return Promise.resolve();
      }
      const ws = this.ws;
      this.ws = undefined;
      return new Promise<void>((res) => {
        ws.onerror = null;
        ws.onclose = () => res();
        ws.close();
      });
    } else {
      if (this.ws !== undefined && this.ws.readyState !== WebSocket.CLOSED) {
        return Promise.resolve();
      }
      return new Promise<void>((res, rej) => {
        const ws = new WebSocket(`${this.baseUrl}/events`);
        ws.onmessage = (msgEvent: MessageEvent<Blob>) =>
          this.eventsSocketMessageHandler(msgEvent).catch((error: unknown) => {
            for (const subscriber of this.subscribers) {
              subscriber.onError(error);
            }
          });
        ws.onerror = rej;
        ws.onopen = () => {
          ws.onerror = (event: Event) => {
            for (const subscriber of this.subscribers) {
              subscriber.onError(new ClientError({ type: "websocket error", event }));
            }
          };
          res();
        };
        this.ws = ws;
      });
    }
  }

  subscribeEvents(subscriber: WebSocketSubscriber): () => void {
    (async () => {
      this.subscribers.add(subscriber);
      await this.syncSocketState();
      subscriber.onConnect();
    })().catch(subscriber.onError);
    return () => {
      (async () => {
        this.subscribers.delete(subscriber);
        await this.syncSocketState();
      })().catch(subscriber.onError);
    };
  }
}

export class MasterKeyPublic {
  name: string;
  uuid: string;
  encryptionPublicKey: X25519PublicKey;
  protected encryptionPrivateKeyEncrypted: EncryptedX25519PrivateKey;
  signingPublicKey: Ed25519PublicKey;
  protected signingPrivateKeyEncrypted: EncryptedEd25519PrivateKey;
  constructor(opts: {
    name: string;
    uuid: string;
    encryptionKey: {
      public: X25519PublicKey;
      privateEncrypted: EncryptedX25519PrivateKey;
    };
    signingKey: {
      public: Ed25519PublicKey;
      privateEncrypted: EncryptedEd25519PrivateKey;
    };
  }) {
    this.name = opts.name;
    this.uuid = opts.uuid;
    this.encryptionPublicKey = opts.encryptionKey.public;
    this.encryptionPrivateKeyEncrypted = opts.encryptionKey.privateEncrypted;
    this.signingPublicKey = opts.signingKey.public;
    this.signingPrivateKeyEncrypted = opts.signingKey.privateEncrypted;
  }

  static async fromWireFormat(mk: schemas.MasterKey): Promise<MasterKeyPublic> {
    const encryptionPublicKey = await X25519PublicKey.import(mk.encryptionKey.public, "master key");
    const signingPublicKey = await Ed25519PublicKey.import(mk.signingKey.public);
    return new MasterKeyPublic({
      name: mk.name,
      uuid: mk.uuid,
      encryptionKey: {
        public: encryptionPublicKey,
        privateEncrypted: {
          type: "encrypted x25519 private key",
          key: { type: "ciphertext", data: mk.encryptionKey.privateEncrypted },
          salt: { type: "salt", data: mk.encryptionKey.salt },
        },
      },
      signingKey: {
        public: signingPublicKey,
        privateEncrypted: {
          type: "encrypted ed25519 private key",
          key: { type: "ciphertext", data: mk.signingKey.privateEncrypted },
          salt: { type: "salt", data: mk.signingKey.salt },
        },
      },
    });
  }

  async toKeyPair(password: string): Promise<MasterKeyPair> {
    const kdfPassword = await KeyDerivationPassword.import(password);
    const encryptionPrivateKey = await X25519PrivateKey.import(
      this.encryptionPrivateKeyEncrypted,
      kdfPassword,
      "master key",
    );
    const signingPrivateKey = await Ed25519PrivateKey.import(
      this.signingPrivateKeyEncrypted,
      kdfPassword,
    );
    return new MasterKeyPair({
      uuid: this.uuid,
      name: this.name,
      encryptionKey: {
        public: this.encryptionPublicKey,
        privateEncrypted: this.encryptionPrivateKeyEncrypted,
        private: encryptionPrivateKey,
      },
      signingKey: {
        public: this.signingPublicKey,
        privateEncrypted: this.signingPrivateKeyEncrypted,
        private: signingPrivateKey,
      },
      password,
    });
  }
}

export class MasterKeyPair extends MasterKeyPublic {
  encryptionPrivateKey: X25519PrivateKey;
  signingPrivateKey: Ed25519PrivateKey;
  password: string;
  constructor(opts: {
    name: string;
    uuid: string;
    encryptionKey: {
      public: X25519PublicKey;
      private: X25519PrivateKey;
      privateEncrypted: EncryptedX25519PrivateKey;
    };
    signingKey: {
      public: Ed25519PublicKey;
      private: Ed25519PrivateKey;
      privateEncrypted: EncryptedEd25519PrivateKey;
    };
    password: string;
  }) {
    super(opts);
    this.encryptionPrivateKey = opts.encryptionKey.private;
    this.signingPrivateKey = opts.signingKey.private;
    this.password = opts.password;
  }

  static async generate(uuid: string, name: string, password: string) {
    const encryptionKeyPair = await generateX25519KeyPair("master key");
    const signingKeyPair = await generateEd25519KeyPair();
    const kdfPassword = await KeyDerivationPassword.import(password);
    return new MasterKeyPair({
      name,
      uuid,
      encryptionKey: {
        public: encryptionKeyPair.publicKey,
        private: encryptionKeyPair.privateKey,
        privateEncrypted: await encryptionKeyPair.privateKey.export(kdfPassword),
      },
      signingKey: {
        public: signingKeyPair.publicKey,
        private: signingKeyPair.privateKey,
        privateEncrypted: await signingKeyPair.privateKey.export(kdfPassword),
      },
      password,
    });
  }

  async toWireFormat(): Promise<schemas.MasterKey> {
    return {
      name: this.name,
      uuid: this.uuid,
      encryptionKey: {
        public: await this.encryptionPublicKey.export(),
        privateEncrypted: this.encryptionPrivateKeyEncrypted.key.data,
        salt: this.encryptionPrivateKeyEncrypted.salt.data,
      },
      signingKey: {
        public: await this.signingPublicKey.export(),
        privateEncrypted: this.signingPrivateKeyEncrypted.key.data,
        salt: this.signingPrivateKeyEncrypted.salt.data,
      },
    };
  }
}

export class AuthToken {
  token: schemas.AuthToken;
  tokenStr: string;
  private constructor(token: schemas.AuthToken) {
    this.token = token;
    this.tokenStr = mpEncoder.encode(token).toBase64();
  }

  static async init(opts: {
    masterKey: MasterKeyPair;
    expiry: Temporal.Instant;
    permissions: Set<"add master key" | "write jobs">;
  }): Promise<AuthToken> {
    const expiryStr = opts.expiry.toString();
    const authorization: schemas.Authorization = {
      expiry: expiryStr,
      permissions: opts.permissions,
    };
    const packed = mpEncoder.encode(authorization);
    const signed = await opts.masterKey.signingPrivateKey.sign(packed);
    const token: schemas.AuthToken = {
      masterKeyId: opts.masterKey.uuid,
      authorization,
      signature: signed.signature,
    };
    return new AuthToken(token);
  }

  static import(bytes: Bytes) {
    const token = schemas.AuthToken.parse(mpDecoder.decode(bytes));
    return new AuthToken(token);
  }

  static fromStr(tokenStr: string) {
    return AuthToken.import(Uint8Array.fromBase64(tokenStr));
  }
}

export class Job {
  uuid: string;
  key: AESKey;
  constructor(uuid: string, key: AESKey) {
    this.uuid = uuid;
    this.key = key;
  }

  static async generate(uuid: string) {
    const jobKey = await AESKey.generate();
    return new Job(uuid, jobKey);
  }

  withNumber(number: number): NumberedJob {
    return new NumberedJob(this.uuid, this.key, number);
  }
}

export class NumberedJob extends Job {
  number: number;
  constructor(uuid: string, key: AESKey, number: number) {
    super(uuid, key);
    this.number = number;
  }

  async trustedSerialize(): Promise<string> {
    const toPack = {
      number: this.number,
      uuid: this.uuid,
      key: (await this.key.trustedExport()).data,
    };
    const packed = mpEncoder.encode(toPack);
    return packed.toBase64();
  }

  static async deserialize(serialize: string): Promise<NumberedJob> {
    const unpacked = mpDecoder.decode(Uint8Array.fromBase64(serialize)) as {
      number: number;
      uuid: string;
      key: Bytes;
    };
    const key = await AESKey.import({ type: "unencrypted key material", data: unpacked.key });
    return new NumberedJob(unpacked.uuid, key, unpacked.number);
  }
}

export type SubscriptionEvent =
  | {
      type: "new job";
      job: NumberedJob;
    }
  | {
      type: "job event";
      event: JobEvent;
    };

export type JobEvent = {
  uuid: string;
  data: unknown;
  job: Job;
};

export type JobBlob = {
  uuid: string;
  data: Bytes;
  job: Job;
};
