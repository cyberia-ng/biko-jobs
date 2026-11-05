import { assertNever } from "@biko-jobs/api-client/assert-never.ts";
import {
  AESKey,
  Ed25519PrivateKey,
  Ed25519PublicKey,
  generateEd25519KeyPair,
  generateX25519KeyPair,
  ScryptPassword,
  X25519PrivateKey,
  X25519PublicKey,
  type Salt,
} from "@biko-jobs/api-client/crypto.ts";
import { mpDecoder, mpEncoder } from "@biko-jobs/api-client/messagepack.ts";
import type { Bytes } from "@biko-jobs/api-client/schemas.ts";
import * as schemas from "@biko-jobs/api-client/schemas.ts";
import pick from "lodash/pick.js";
import { z } from "zod";

export type { Bytes } from "@biko-jobs/api-client/schemas.ts";

export type ClientErrorInfo =
  | { type: "http error"; status: number }
  | { type: "websocket error"; event: Event }
  | { type: "stream create conflict"; uuid: string }
  | { type: "blob create conflict"; uuid: string }
  | { type: "duplicate event"; uuid: string }
  | { type: "stream keys incomplete" }
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
      case "stream keys incomplete":
      case "not authorized":
        break;
      case "stream create conflict":
      case "blob create conflict":
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
  const searchParams = new URLSearchParams();
  if (options?.query !== undefined) {
    for (const [param, value] of Object.entries(options.query)) {
      searchParams.append(param, value);
    }
  }
  if (options?.auth !== undefined) {
    fetchOptions.headers = fetchOptions.headers ?? {};
    Object.assign(fetchOptions.headers, { Authorization: options.auth.tokenStr });
  }
  const res = await fetch(`${baseUrl}/${endpoint}?${searchParams.toString()}`, fetchOptions);
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
  getStream: (uuid: string) => Stream | undefined;
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
    const body = z.array(schemas.MasterKeyPublic).parse(res.body);
    return Promise.all(body.map((k) => MasterKeyPublic.fromWireFormat(k)));
  }

  async getMasterKeyPair(password: MasterKeyPassword): Promise<MasterKeyPair> {
    const res = await apiFetch(this.baseUrl, ["master-keys", password.uuid, "get-private"], {
      method: "POST",
      body: password.hash,
    });
    raiseForStatus(res);
    const body = schemas.MasterKey.parse(res.body);
    const mkPublic = await MasterKeyPublic.fromWireFormat(body);
    const encryptionKeyPrivate = await X25519PrivateKey.import(
      { type: "ciphertext", data: body.encryptionKeyPrivateEncrypted },
      password.scryptPassword,
    );
    const signingKeyPrivate = await Ed25519PrivateKey.import(
      { type: "ciphertext", data: body.signingKeyPrivateEncrypted },
      password.scryptPassword,
    );
    return new MasterKeyPair({
      publicKey: mkPublic,
      password,
      encryptionKeyPrivate: encryptionKeyPrivate,
      signingKeyPrivate: signingKeyPrivate,
    });
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

  async addStream(uuid: string, access: MasterKeyPublic[], auth: AuthToken): Promise<Stream> {
    const streamKey = await AESKey.generate();
    const encryptedStreamKeysArrayP = access.map(
      async (mkp) =>
        [
          mkp.uuid,
          (await streamKey.encryptKey(mkp.encryptionPublicKey, `stream key/${uuid}`)).data,
        ] as const,
    );
    const encryptedStreamKeys = new Map(await Promise.all(encryptedStreamKeysArrayP));
    const body: schemas.StreamKeys = encryptedStreamKeys;
    const res = await apiFetch(this.baseUrl, ["streams", uuid], {
      method: "PUT",
      body,
      auth,
    });
    switch (res.status) {
      case 409:
        throw new ClientError({ type: "stream create conflict", uuid });
      case 422:
        throw new ClientError({ type: "stream keys incomplete" });
    }
    raiseForStatus(res);
    return new Stream(uuid, streamKey, z.number().parse(res.body));
  }

  async listStreams(masterKey: MasterKeyPair, authToken: AuthToken): Promise<Array<Stream>> {
    const res = await apiFetch(this.baseUrl, ["streams"], {
      method: "GET",
      auth: authToken,
    });
    raiseForStatus(res);
    const body = schemas.StreamList.parse(res.body);
    const streamsP = body.map(async ({ uuid, keys, number }) => {
      const encryptedKey = keys.get(masterKey.uuid)!;
      const key = await AESKey.decryptKey(
        masterKey.encryptionKeyPrivate,
        {
          type: "ciphertext",
          data: encryptedKey,
        },
        `stream key/${uuid}`,
      );
      return new Stream(uuid, key, number);
    });
    return Promise.all(streamsP);
  }

  async getEventsByStreams(
    streams: Stream[],
    authToken: AuthToken,
  ): Promise<Map<string, StreamEvent[]>> {
    const res = await apiFetch(this.baseUrl, ["events"], {
      method: "GET",
      auth: authToken,
      query: {
        streams: mpEncoder.encode(new Set(streams.map((stream) => stream.number))).toBase64(),
      },
    });
    raiseForStatus(res);
    const responseBody = schemas.StreamEvents.parse(res.body);
    const streamsMap = new Map(streams.map((stream) => [stream.uuid, stream]));
    const eventPs = responseBody.events.map(async (event) => {
      const stream = streamsMap.get(event.stream)!;
      const decrypted = await stream.key.decrypt({ type: "ciphertext", data: event.data });
      const decoded = mpDecoder.decode(decrypted.data);
      return { uuid: event.uuid, data: decoded, stream } satisfies StreamEvent;
    });
    const events = await Promise.all(eventPs);
    const out: Map<string, StreamEvent[]> = new Map();
    for (const event of events) {
      let streamEvents: StreamEvent[] | undefined = out.get(event.stream.uuid);
      if (streamEvents === undefined) {
        streamEvents = [];
        out.set(event.stream.uuid, streamEvents);
      }
      streamEvents.push(event);
    }
    for (const emptyStream of responseBody.emptyStreams) {
      out.set(emptyStream, []);
    }
    return out;
  }

  async addEvent(event: StreamEvent, auth: AuthToken) {
    const encoded = mpEncoder.encode(event.data);
    const encrypted = await event.stream.key.encrypt({ type: "plaintext", data: encoded });
    const res = await apiFetch(this.baseUrl, ["events"], {
      method: "POST",
      body: {
        stream: event.stream.uuid,
        uuid: event.uuid,
        data: encrypted.data,
      } satisfies schemas.StreamEvent,
      auth,
    });
    if (res.status === 409) throw new ClientError({ type: "duplicate event", uuid: event.uuid });
    raiseForStatus(res);
  }

  async putBlob(blob: StreamBlob, auth: AuthToken) {
    const encrypted = await blob.stream.key.encrypt({ type: "plaintext", data: blob.data });
    const res = await apiFetch(this.baseUrl, ["blobs", blob.uuid], {
      method: "PUT",
      body: encrypted.data,
      auth,
    });
    if (res.status === 409) {
      throw new ClientError({ type: "blob create conflict", uuid: blob.uuid });
    }
    raiseForStatus(res);
  }

  async getBlob(uuid: string, stream: Stream, auth: AuthToken): Promise<StreamBlob | undefined> {
    const res = await apiFetch(this.baseUrl, ["blobs", uuid], { auth });
    if (res.status === 404) {
      return undefined;
    }
    raiseForStatus(res);
    const body = schemas.Bytes.parse(res.body);
    const decrypted = await stream.key.decrypt({ type: "ciphertext", data: body });
    return { uuid, data: decrypted.data, stream };
  }

  private async eventsSocketMessageHandler(msgEvent: MessageEvent<Blob>) {
    const data = await msgEvent.data.bytes();
    const decoded = mpDecoder.decode(data);
    const socketEvent = schemas.SocketEvent.parse(decoded);
    for (const subscriber of this.subscribers) {
      switch (socketEvent.type) {
        case "new stream":
          {
            let streamKey: AESKey | undefined = undefined;
            for (const [masterKeyUUID, encryptedStreamKey] of socketEvent.stream.keys.entries()) {
              const mk = subscriber.getMasterKey(masterKeyUUID);
              if (mk === undefined) continue;
              streamKey = await AESKey.decryptKey(
                mk.encryptionKeyPrivate,
                {
                  type: "ciphertext",
                  data: encryptedStreamKey,
                },
                `stream key/${socketEvent.stream.uuid}`,
              );
              break;
            }
            if (streamKey === undefined) continue;
            const stream = new Stream(
              socketEvent.stream.uuid,
              streamKey,
              socketEvent.stream.number,
            );
            subscriber.onEvent({ type: "new stream", stream });
          }
          break;
        case "stream event":
          {
            const stream = subscriber.getStream(socketEvent.event.stream);
            if (stream === undefined) continue;
            const decrypted = await stream.key.decrypt({
              type: "ciphertext",
              data: socketEvent.event.data,
            });
            const decoded = mpDecoder.decode(decrypted.data);
            subscriber.onEvent({
              type: "stream event",
              event: { uuid: socketEvent.event.uuid, data: decoded, stream },
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

export class MasterKeyPassword {
  uuid: string;
  scryptPassword: ScryptPassword;
  hash: Bytes;
  private constructor(opts: { uuid: string; password: ScryptPassword; hash: Bytes }) {
    this.uuid = opts.uuid;
    this.scryptPassword = opts.password;
    this.hash = opts.hash;
  }

  static async init(publicKey: MasterKeyPublic, password: string) {
    const scryptPassword = await ScryptPassword.derive(
      password,
      publicKey.passwordSalt,
      publicKey.passwordHardness,
    );
    return new MasterKeyPassword({
      uuid: publicKey.uuid,
      password: scryptPassword,
      hash: await scryptPassword.hash(),
    });
  }
}

export class MasterKeyPublic {
  name: string;
  uuid: string;
  passwordSalt: Salt;
  passwordHardness: number;
  encryptionPublicKey: X25519PublicKey;
  signingPublicKey: Ed25519PublicKey;
  constructor(opts: {
    name: string;
    uuid: string;
    passwordSalt: Salt;
    passwordHardness: number;
    encryptionKey: X25519PublicKey;
    signingKey: Ed25519PublicKey;
  }) {
    this.name = opts.name;
    this.uuid = opts.uuid;
    this.passwordSalt = opts.passwordSalt;
    this.passwordHardness = opts.passwordHardness;
    this.encryptionPublicKey = opts.encryptionKey;
    this.signingPublicKey = opts.signingKey;
  }

  static async fromWireFormat(mk: schemas.MasterKeyPublic): Promise<MasterKeyPublic> {
    const encryptionPublicKey = await X25519PublicKey.import(mk.encryptionKeyPublic);
    const signingPublicKey = await Ed25519PublicKey.import(mk.signingKeyPublic);
    return new MasterKeyPublic({
      name: mk.name,
      uuid: mk.uuid,
      passwordSalt: { type: "salt", data: mk.passwordSalt },
      passwordHardness: mk.passwordHardness,
      encryptionKey: encryptionPublicKey,
      signingKey: signingPublicKey,
    });
  }
}

export class MasterKeyPair {
  publicKey: MasterKeyPublic;
  encryptionKeyPrivate: X25519PrivateKey;
  signingKeyPrivate: Ed25519PrivateKey;
  password: MasterKeyPassword;
  constructor(opts: {
    publicKey: MasterKeyPublic;
    password: MasterKeyPassword;
    encryptionKeyPrivate: X25519PrivateKey;
    signingKeyPrivate: Ed25519PrivateKey;
  }) {
    this.publicKey = opts.publicKey;
    this.encryptionKeyPrivate = opts.encryptionKeyPrivate;
    this.signingKeyPrivate = opts.signingKeyPrivate;
    this.password = opts.password;
  }

  get uuid() {
    return this.publicKey.uuid;
  }

  get name() {
    return this.publicKey.name;
  }

  static async generate(uuid: string, name: string, password: string, hardness: number = 16) {
    const salt: Salt = { type: "salt", data: crypto.getRandomValues(new Uint8Array(16)) };
    const encryptionKeyPair = await generateX25519KeyPair();
    const signingKeyPair = await generateEd25519KeyPair();
    const publicKey = new MasterKeyPublic({
      name,
      uuid,
      passwordSalt: salt,
      passwordHardness: hardness,
      encryptionKey: encryptionKeyPair.publicKey,
      signingKey: signingKeyPair.publicKey,
    });
    const mkPassword = await MasterKeyPassword.init(publicKey, password);
    return new MasterKeyPair({
      publicKey,
      encryptionKeyPrivate: encryptionKeyPair.privateKey,
      signingKeyPrivate: signingKeyPair.privateKey,
      password: mkPassword,
    });
  }

  async toWireFormat(): Promise<schemas.MasterKey> {
    return {
      name: this.publicKey.name,
      uuid: this.publicKey.uuid,
      passwordSalt: this.publicKey.passwordSalt.data,
      passwordHardness: this.publicKey.passwordHardness,
      passwordHash: this.password.hash,
      encryptionKeyPublic: await this.publicKey.encryptionPublicKey.export(),
      encryptionKeyPrivateEncrypted: (
        await this.encryptionKeyPrivate.export(this.password.scryptPassword)
      ).data,
      signingKeyPublic: await this.publicKey.signingPublicKey.export(),
      signingKeyPrivateEncrypted: (
        await this.signingKeyPrivate.export(this.password.scryptPassword)
      ).data,
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
    permissions: Set<schemas.Permission>;
  }): Promise<AuthToken> {
    const expiryStr = opts.expiry.toString();
    const authorization: schemas.Authorization = {
      expiry: expiryStr,
      permissions: opts.permissions,
    };
    const packed = mpEncoder.encode(authorization);
    const signed = await opts.masterKey.signingKeyPrivate.sign(packed);
    const token: schemas.AuthToken = {
      masterKeyId: opts.masterKey.publicKey.uuid,
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

export class Stream {
  uuid: string;
  key: AESKey;
  number: number;
  constructor(uuid: string, key: AESKey, number: number) {
    this.uuid = uuid;
    this.key = key;
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

  static async deserialize(serialize: string): Promise<Stream> {
    const unpacked = mpDecoder.decode(Uint8Array.fromBase64(serialize)) as {
      number: number;
      uuid: string;
      key: Bytes;
    };
    const key = await AESKey.import({ type: "unencrypted key material", data: unpacked.key });
    return new Stream(unpacked.uuid, key, unpacked.number);
  }
}

export type SubscriptionEvent =
  | {
      type: "new stream";
      stream: Stream;
    }
  | {
      type: "stream event";
      event: StreamEvent;
    };

export type StreamEvent = {
  uuid: string;
  data: unknown;
  stream: Stream;
};

export type StreamBlob = {
  uuid: string;
  data: Bytes;
  stream: Stream;
};
