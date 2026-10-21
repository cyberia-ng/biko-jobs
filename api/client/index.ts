import { assertNever } from "@biko-jobs/api-client/assertNever.ts";
import {
  AESKey,
  generateRSAKeyPair,
  KeyDerivationPassword,
  RSAPrivateKey,
  RSAPublicKey,
  type EncryptedPrivateKey,
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
  | { type: "master key post conflict"; name: string; uuid: string };

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
  onConnect: () => void;
  onEvent: (event: JobEvent) => void;
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

  async addMasterKeyPair(keyPair: MasterKeyPair): Promise<void> {
    const res = await apiFetch(this.baseUrl, ["master-keys"], {
      method: "POST",
      body: await keyPair.toWireFormat(),
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

  async addJob(job: Job, access: MasterKeyPublic[]): Promise<void> {
    const encryptedJobKeysArrayP = access.map(
      async (mkp) => [mkp.uuid, (await job.key.encryptKey(mkp.publicKey)).data] as const,
    );
    const encryptedJobKeys = new Map(await Promise.all(encryptedJobKeysArrayP));
    const body: schemas.Job = {
      uuid: job.uuid,
      keys: encryptedJobKeys,
    };
    const res = await apiFetch(this.baseUrl, ["jobs", body.uuid], {
      method: "PUT",
      body,
    });
    switch (res.status) {
      case 409:
        throw new ClientError({ type: "job put conflict", uuid: body.uuid });
      case 422:
        throw new ClientError({ type: "job keys incomplete" });
    }
    raiseForStatus(res);
  }

  async getJobs(masterKey: MasterKeyPair): Promise<Job[]> {
    const res = await apiFetch(this.baseUrl, ["jobs"], {
      method: "GET",
    });
    raiseForStatus(res);
    const body = schemas.JobList.parse(res.body);
    const jobsP = body.map(async ({ uuid, keys }) => {
      const encryptedKey = keys.get(masterKey.uuid)!;
      const key = await AESKey.decryptKey(masterKey.privateKey, {
        type: "ciphertext",
        data: encryptedKey,
      });
      return new Job(uuid, key);
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

  async addEvent(event: JobEvent) {
    const encoded = mpEncoder.encode(event.data);
    const encrypted = await event.job.key.encrypt({ type: "plaintext", data: encoded });
    const res = await apiFetch(this.baseUrl, ["events"], {
      method: "POST",
      body: {
        job: event.job.uuid,
        uuid: event.uuid,
        data: encrypted.data,
      } satisfies schemas.JobEvent,
    });
    if (res.status === 409) throw new ClientError({ type: "duplicate event", uuid: event.uuid });
    raiseForStatus(res);
  }

  async putBlob(blob: JobBlob) {
    const encrypted = await blob.job.key.encrypt({ type: "plaintext", data: blob.data });
    const res = await apiFetch(this.baseUrl, ["blobs"], {
      method: "POST",
      body: { job: blob.job.uuid, uuid: blob.uuid, data: encrypted.data } satisfies schemas.JobBlob,
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
    const jobEvent = schemas.JobEvent.parse(decoded);
    for (const subscriber of this.subscribers) {
      const job = subscriber.getJob(jobEvent.job);
      if (job === undefined) continue;
      const decrypted = await job.key.decrypt({ type: "ciphertext", data: jobEvent.data });
      const decoded = mpDecoder.decode(decrypted.data);
      subscriber.onEvent({ uuid: jobEvent.uuid, data: decoded, job });
    }
  }

  private connectEventsSocket() {
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

  private disconnectEventsSocket() {
    return new Promise<void>((res) => {
      if (this.ws === undefined) res();
      else {
        this.ws.onerror = null;
        this.ws.onclose = () => res();
        this.ws.close();
        this.ws = undefined;
      }
    });
  }

  async refreshEventsSocket() {
    await this.disconnectEventsSocket();
    if (this.subscribers.size !== 0) {
      await this.connectEventsSocket();
    }
  }

  async closeEventsSocket() {
    this.subscribers = new Set();
    await this.disconnectEventsSocket();
  }

  subscribeEvents(subscriber: WebSocketSubscriber): () => void {
    (async () => {
      if (this.subscribers.size === 0) {
        await this.connectEventsSocket();
        subscriber.onConnect();
      }
      this.subscribers.add(subscriber);
    })().catch(subscriber.onError);
    return () => {
      (async () => {
        this.subscribers.delete(subscriber);
        if (this.subscribers.size === 0) {
          await this.disconnectEventsSocket();
        }
      })().catch(subscriber.onError);
    };
  }
}

export class MasterKeyPublic {
  name: string;
  uuid: string;
  publicKey: RSAPublicKey;
  protected encryptedPrivateKey: EncryptedPrivateKey;
  constructor(opts: {
    name: string;
    uuid: string;
    publicKey: RSAPublicKey;
    encryptedPrivateKey: EncryptedPrivateKey;
  }) {
    this.name = opts.name;
    this.uuid = opts.uuid;
    this.publicKey = opts.publicKey;
    this.encryptedPrivateKey = opts.encryptedPrivateKey;
  }

  static async fromWireFormat(mk: schemas.MasterKey): Promise<MasterKeyPublic> {
    const key = await RSAPublicKey.import(mk.publicKey);
    return new MasterKeyPublic({
      name: mk.name,
      uuid: mk.uuid,
      publicKey: key,
      encryptedPrivateKey: {
        type: "encrypted private key",
        key: { type: "ciphertext", data: mk.encryptedPrivateKey },
        salt: { type: "salt", data: mk.salt },
      },
    });
  }

  async toKeyPair(password: string): Promise<MasterKeyPair> {
    const kdfPassword = await KeyDerivationPassword.import(password);
    const privateKey = await RSAPrivateKey.import(this.encryptedPrivateKey, kdfPassword);
    return new MasterKeyPair({
      uuid: this.uuid,
      name: this.name,
      publicKey: this.publicKey,
      encryptedPrivateKey: this.encryptedPrivateKey,
      privateKey,
      password,
    });
  }
}

export class MasterKeyPair extends MasterKeyPublic {
  privateKey: RSAPrivateKey;
  password: string;
  constructor(opts: {
    name: string;
    uuid: string;
    publicKey: RSAPublicKey;
    privateKey: RSAPrivateKey;
    password: string;
    encryptedPrivateKey: EncryptedPrivateKey;
  }) {
    super(pick(opts, ["name", "uuid", "publicKey", "encryptedPrivateKey"]));
    this.privateKey = opts.privateKey;
    this.password = opts.password;
  }

  static async generate(name: string, password: string) {
    const keyPair = await generateRSAKeyPair();
    const kdfPassword = await KeyDerivationPassword.import(password);
    const encryptedPrivateKey = await keyPair.privateKey.export(kdfPassword);
    return new MasterKeyPair({
      name,
      uuid: crypto.randomUUID(),
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      password,
      encryptedPrivateKey,
    });
  }

  async toWireFormat(): Promise<schemas.MasterKey> {
    return {
      name: this.name,
      uuid: this.uuid,
      salt: this.encryptedPrivateKey.salt.data,
      publicKey: await this.publicKey.export(),
      encryptedPrivateKey: this.encryptedPrivateKey.key.data,
    };
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
}

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
