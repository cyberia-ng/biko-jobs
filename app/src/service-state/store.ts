import type { WrappedStreamAction, AnyVersionStreamAction, StreamAction } from "./action.ts";
import { migrateAction } from "./stream-actions/migrate.ts";
import { reducer } from "./reducer.ts";
import { initialState, type State } from "./state.ts";
import { type State as LoginState } from "../login-state.ts";
import {
  ApiClient,
  AuthToken,
  Stream,
  type Bytes,
  type StreamBlob,
  type MasterKeyPair,
  type MasterKeyPublic,
} from "@biko-jobs/api-client";

const AUTH_TOKEN_LIFETIME = Temporal.Duration.from({ minutes: 5 });

export class Store {
  private state: State;
  private streams: Map<string, Stream>;
  private masterKeys: MasterKeyPublic[];
  private client: ApiClient;
  private subscribers: Set<() => void>;
  private unsubscribe: (() => void) | undefined;
  private onAsyncError: (e: unknown) => void;
  private loginState:
    | { type: "master key pair"; masterKey: MasterKeyPair; authToken: AuthToken }
    | { type: "ephemeral"; authToken: AuthToken }
    | { type: "not logged in" };

  constructor(client: ApiClient, onAsyncError: (e: unknown) => void) {
    this.client = client;
    this.masterKeys = [];
    this.loginState = { type: "not logged in" };
    this.onAsyncError = onAsyncError;
    this.state = initialState;
    this.streams = new Map();
    this.subscribers = new Set();
  }

  private async getStreams() {
    if (this.loginState.type === "master key pair") {
      const streams = await this.client.listStreams(
        this.loginState.masterKey,
        await this.getAuthToken(),
      );
      for (const stream of streams) {
        this.streams.set(stream.name, stream);
      }
      this.callSubscribers();
    } else if (this.loginState.type === "ephemeral") {
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const name = window.sessionStorage.key(i);
        if (name === null) continue;
        if (!name.startsWith("ephemeral job stream/")) continue;
        const serialized = window.sessionStorage.getItem(name);
        if (serialized === null) continue;
        const stream = await Stream.deserialize(serialized);
        this.streams.set(stream.name, stream);
      }
      this.callSubscribers();
    }
  }

  private async getStreamEvents() {
    const events = await this.client.getEventsByStreams(
      Array.from(this.streams.values()),
      await this.getAuthToken(),
    );
    for (const streamEvents of events.values()) {
      for (const event of streamEvents) {
        const action = event.data as AnyVersionStreamAction;
        this.reduceStreamAction(action, event.stream, event.uuid);
      }
    }
    this.callSubscribers();
  }

  private reduceStreamAction(action: AnyVersionStreamAction, stream: Stream, actionUUID: string) {
    const migrated = migrateAction(action);
    const wrappedAction: WrappedStreamAction = {
      actionUUID,
      streamName: stream.name,
      streamNumber: stream.number,
      inner: migrated,
    };
    this.reduce(wrappedAction);
  }

  private reduce(action: WrappedStreamAction) {
    this.state = reducer(this.state, action);
  }

  private callSubscribers() {
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }

  private async getAuthToken(): Promise<AuthToken> {
    switch (this.loginState.type) {
      case "master key pair": {
        if (
          Temporal.Instant.compare(
            this.loginState.authToken.token.authorization.expiry,
            Temporal.Now.instant().add(multiplyDuration(AUTH_TOKEN_LIFETIME, 0.9)),
          ) === -1
        ) {
          this.loginState.authToken = await generateAuthToken(this.loginState.masterKey);
        }
        return this.loginState.authToken;
      }
      case "ephemeral": {
        return this.loginState.authToken;
      }
      case "not logged in":
        throw new Error("not logged in");
    }
  }

  async getMechanicsStream(): Promise<Stream> {
    const existing = this.streams.get("mechanics");
    if (existing !== undefined) return existing;
    const newStream = await this.client.addStream(
      {
        name: "mechanics",
        access: this.masterKeys,
      },
      await this.getAuthToken(),
    );
    this.streams.set("mechanics", newStream);
    return newStream;
  }

  async createJobStream(uuid: string): Promise<void> {
    const authToken = await this.getAuthToken();
    const stream = await this.client.addStream({ name: uuid, access: this.masterKeys }, authToken);
    if (this.loginState.type === "ephemeral") {
      const serialized = await stream.trustedSerialize();
      window.sessionStorage.setItem(`ephemeral job stream/${stream.name}`, serialized);
    }
    this.streams.set(stream.name, stream);
    this.callSubscribers();
  }

  subscribe(cb: () => void): () => void {
    if (this.subscribers.size === 0) {
      this.unsubscribe = this.client.subscribeEvents({
        getStream: (uuid) => this.streams.get(uuid),
        getMasterKey: (uuid) =>
          this.loginState.type === "master key pair" && this.loginState.masterKey.uuid === uuid
            ? this.loginState.masterKey
            : undefined,
        onEvent: (event) => {
          switch (event.type) {
            case "new stream":
              this.streams.set(event.stream.name, event.stream);
              break;
            case "stream event":
              const action = event.event.data as AnyVersionStreamAction;
              this.reduceStreamAction(action, event.event.stream, event.event.uuid);
          }
          this.callSubscribers();
        },
        onConnect: () => {},
        onError: this.onAsyncError.bind(this),
      });
    }
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
      setTimeout(() => {
        if (this.subscribers.size === 0) {
          this.unsubscribe?.();
        }
      }, 1000);
    };
  }

  getSnapshot(): State {
    return this.state;
  }

  async refresh(loginState: LoginState) {
    this.masterKeys = loginState.masterKeys ?? [];
    switch (loginState.login?.type) {
      case "master key":
        this.loginState = {
          type: "master key pair",
          masterKey: loginState.login.masterKey,
          authToken: await generateAuthToken(loginState.login.masterKey),
        };
        break;
      case "ephemeral":
        this.loginState = { type: "ephemeral", authToken: loginState.login.authToken };
        break;
      case undefined:
        this.loginState = { type: "not logged in" };
        break;
    }
    await this.client.syncSocketState();
    this.state = initialState;
    if (loginState.login !== undefined) {
      await this.getStreams();
      await this.getStreamEvents();
    }
    this.callSubscribers();
  }

  async dispatch(action: StreamAction, streamName: string) {
    let stream: Stream | undefined;
    switch (action.type) {
      case "job action": {
        stream = this.streams.get(streamName);
        break;
      }
      case "mechanic list action": {
        stream = await this.getMechanicsStream();
      }
    }
    if (stream === undefined) {
      throw new Error("attempted to dispatch an action for a stream that does not exist");
    }
    const authToken = await this.getAuthToken();
    const actionUUID = crypto.randomUUID();
    const wrapped: WrappedStreamAction = {
      actionUUID,
      streamName: stream.name,
      streamNumber: stream.number,
      inner: action,
    };
    this.reduce(wrapped);
    this.callSubscribers();
    await this.client.addEvent({ uuid: actionUUID, data: action, stream }, authToken);
  }

  async getBlob(blobUUID: string, streamName: string): Promise<Bytes | undefined> {
    const stream = this.streams.get(streamName);
    if (stream === undefined) {
      return undefined;
    }
    const blob = await this.client.getBlob(blobUUID, stream, await this.getAuthToken());
    return blob?.data;
  }

  async putBlob(blobUUID: string, streamName: string, data: Bytes) {
    const authToken = await this.getAuthToken();
    const stream = this.streams.get(streamName);
    if (stream === undefined) {
      throw new Error("no such job");
    }
    const blob: StreamBlob = {
      uuid: blobUUID,
      stream,
      data,
    };
    await this.client.putBlob(blob, authToken);
  }
}

async function generateAuthToken(masterKey: MasterKeyPair): Promise<AuthToken> {
  return await AuthToken.init({
    masterKey,
    expiry: Temporal.Now.instant().add(AUTH_TOKEN_LIFETIME),
    permissions: new Set([
      "list streams",
      "create streams",
      "read stream data",
      "write stream data",
    ]),
  });
}

function multiplyDuration(duration: Temporal.Duration, multiplier: number) {
  return Temporal.Duration.from({ microseconds: duration.total("microseconds") * multiplier });
}
