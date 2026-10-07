import { ApiClient } from "@biko-jobs/api-client";
import { reducer } from "./state/reducer.ts";
import { initialState, type State } from "./state/state.ts";
import type { Action } from "./state/action.ts";

export class Store {
  private client: ApiClient;
  private state: State;
  private subscribers: Set<() => void>;

  private constructor(client: ApiClient) {
    this.client = client;
    this.state = initialState;
    this.subscribers = new Set();
    this.client.subscribeEvents((event) => {
      this.onAction(event as Action);
    });
  }

  static async init(baseUrl: string, session: string, pass: string) {
    const client = await ApiClient.open(baseUrl, session, pass);
    const store = new Store(client);
    await store.refreshState();
    return store;
  }

  async refreshState() {
    const actions = (await this.client.events()) as Action[];
    let state: State = initialState;
    for (const action of actions) {
      state = reducer(state, action);
    }
    this.state = state;
    this.callSubscribers();
  }

  getSnapshot(): State {
    return this.state;
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  async postAction(action: Action) {
    await this.client.postEvent(action);
  }

  async writeBlob(id: string, data: Uint8Array<ArrayBuffer>) {
    await this.client.putBlob(id, data);
  }

  async getBlob(id: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
    return this.client.getBlob(id);
  }

  private callSubscribers() {
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }

  private onAction(action: Action) {
    this.state = reducer(this.state, action);
    this.callSubscribers();
  }
}
