import type { Action, AnyVersionAction } from "./action.ts";
import { migrateAction } from "./actions/migrate.ts";
import { reducer } from "./reducer.ts";
import { initialState, type State } from "./state.ts";
import {
  ApiClient,
  Job,
  type Bytes,
  type JobBlob,
  type MasterKeyPair,
  type MasterKeyPublic,
} from "@biko-jobs/api-client";

export class Store {
  private state: State;
  private jobs: Map<string, Job>;
  private masterKeys: MasterKeyPublic[];
  private masterKeyPair: MasterKeyPair | undefined;
  private client: ApiClient;
  private subscribers: Set<() => void>;
  private unsubscribe: (() => void) | undefined;
  private onAsyncError: (e: unknown) => void;

  constructor(
    client: ApiClient,
    masterKeys: MasterKeyPublic[],
    masterKeyPair: MasterKeyPair | undefined,
    onAsyncError: (e: unknown) => void,
  ) {
    this.client = client;
    this.masterKeys = masterKeys;
    this.masterKeyPair = masterKeyPair;
    this.onAsyncError = onAsyncError;
    this.state = initialState;
    this.jobs = new Map();
    this.subscribers = new Set();
  }

  static async openEphemeral(
    client: ApiClient,
    masterKeys: MasterKeyPublic[],
    onAsyncError: (e: unknown) => void,
  ) {
    const store = new Store(client, masterKeys, undefined, onAsyncError);
    return store;
  }

  private reduce(action: Action) {
    this.state = reducer(this.state, action);
  }

  private callSubscribers() {
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }

  async createJob(uuid: string): Promise<void> {
    const job = await Job.generate(uuid);
    await this.client.addJob(job, this.masterKeys);
    this.jobs.set(job.uuid, job);
  }

  subscribe(cb: () => void): () => void {
    if (this.subscribers.size === 0) {
      this.unsubscribe = this.client.subscribeEvents({
        getJob: (uuid) => this.jobs.get(uuid),
        onEvent: (event) => {
          const action = event.data as AnyVersionAction;
          const migrated = migrateAction(action);
          this.reduce(migrated);
          this.callSubscribers();
        },
        onConnect: () => {},
        onError: this.onAsyncError.bind(this),
      });
    }
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
      this.unsubscribe?.();
    };
  }

  getSnapshot(): State {
    return this.state;
  }

  async refresh() {
    this.masterKeys = await this.client.listMasterKeys();
    await this.client.refreshEventsSocket();
  }

  async dispatch(action: Action) {
    let job = this.jobs.get(action.event.uuid);
    if (job === undefined) {
      throw new Error("attempted to dispatch an action for a job that does not exist");
    }
    this.reduce(action);
    this.callSubscribers();
    await this.client.addEvent({ uuid: action.uuid, data: action, job });
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
    const job = this.jobs.get(jobUUID);
    if (job === undefined) {
      throw new Error("no such job");
    }
    const blob: JobBlob = {
      uuid: blobUUID,
      job,
      data,
    };
    await this.client.putBlob(blob);
  }
}
