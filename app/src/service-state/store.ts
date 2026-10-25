import type { Action, AnyVersionJobAction, JobAction } from "./action.ts";
import { migrateAction } from "./job-actions/migrate.ts";
import { reducer } from "./reducer.ts";
import { initialState, type State } from "./state.ts";
import { type State as LoginState } from "../login-state.ts";
import {
  ApiClient,
  AuthToken,
  Job,
  type Bytes,
  type JobBlob,
  type MasterKeyPair,
  type MasterKeyPublic,
} from "@biko-jobs/api-client";

const AUTH_TOKEN_LIFETIME = Temporal.Duration.from({ minutes: 5 });

export class Store {
  private state: State;
  private jobs: Map<string, Job>;
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
    this.jobs = new Map();
    this.subscribers = new Set();
  }

  private async getJobs() {
    if (this.loginState.type === "master key pair") {
      const jobs = await this.client.getJobs(this.loginState.masterKey);
      for (const job of jobs) {
        this.jobs.set(job.uuid, job);
        this.reduce({ type: "create job", uuid: job.uuid, number: job.number });
      }
      this.callSubscribers();
    }
  }

  private async getJobEvents() {
    const events = await this.client.getEventsByJobs(Array.from(this.jobs.values()));
    for (const jobEvents of events.values()) {
      for (const event of jobEvents) {
        const jobAction = event.data as AnyVersionJobAction;
        this.reduceJobAction(jobAction);
      }
    }
    this.callSubscribers();
  }

  private reduceJobAction(jobAction: AnyVersionJobAction) {
    const migrated = migrateAction(jobAction);
    const action: Action = {
      type: "job action",
      action: migrated,
    };
    this.reduce(action);
  }

  private reduce(action: Action) {
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

  async createJob(uuid: string): Promise<void> {
    const authToken = await this.getAuthToken();
    const job = await Job.generate(uuid);
    await this.client.addJob(job, this.masterKeys, authToken);
    this.jobs.set(job.uuid, job);
  }

  subscribe(cb: () => void): () => void {
    if (this.subscribers.size === 0) {
      this.unsubscribe = this.client.subscribeEvents({
        getJob: (uuid) => this.jobs.get(uuid),
        getMasterKey: (uuid) =>
          this.loginState.type === "master key pair" && this.loginState.masterKey.uuid === uuid
            ? this.loginState.masterKey
            : undefined,
        onEvent: (event) => {
          switch (event.type) {
            case "new job":
              this.jobs.set(event.job.uuid, event.job);
              this.reduce({ type: "create job", uuid: event.job.uuid, number: event.jobNumber });
              break;
            case "job event":
              const action = event.event.data as AnyVersionJobAction;
              this.reduceJobAction(action);
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
    await this.getJobs();
    await this.getJobEvents();
    this.callSubscribers();
  }

  async dispatch(action: JobAction) {
    const authToken = await this.getAuthToken();
    let job = this.jobs.get(action.event.uuid);
    if (job === undefined) {
      throw new Error("attempted to dispatch an action for a job that does not exist");
    }
    this.reduce({ type: "job action", action });
    this.callSubscribers();
    await this.client.addEvent({ uuid: action.uuid, data: action, job }, authToken);
  }

  async getBlob(blobUUID: string, jobUUID: string): Promise<Bytes | undefined> {
    const job = this.jobs.get(jobUUID);
    if (job === undefined) {
      return undefined;
    }
    const blob = await this.client.getBlob(blobUUID, job);
    return blob?.data;
  }

  async putBlob(blobUUID: string, jobUUID: string, data: Bytes) {
    const authToken = await this.getAuthToken();
    const job = this.jobs.get(jobUUID);
    if (job === undefined) {
      throw new Error("no such job");
    }
    const blob: JobBlob = {
      uuid: blobUUID,
      job,
      data,
    };
    await this.client.putBlob(blob, authToken);
  }
}

async function generateAuthToken(masterKey: MasterKeyPair): Promise<AuthToken> {
  return await AuthToken.init({
    masterKey,
    expiry: Temporal.Now.instant().add(AUTH_TOKEN_LIFETIME),
    permissions: new Set(["write jobs", "add master key"]),
  });
}

function multiplyDuration(duration: Temporal.Duration, multiplier: number) {
  return Temporal.Duration.from({ microseconds: duration.total("microseconds") * multiplier });
}
