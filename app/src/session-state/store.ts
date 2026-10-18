import { ApiClient, type ClientEvent } from "@biko-jobs/api-client";
import { reducer } from "./reducer.ts";
import { initialState, type State } from "./state.ts";
import type { Action, AnyVersionAction } from "./action.ts";
import { migrateAction } from "./actions/migrate.ts";

export class Store {
  private client: ApiClient;
  private unsubscribe: () => void;
  private state: State;
  private subscribers: Set<() => void>;

  private constructor(state: State, client: ApiClient) {
    this.client = client;
    this.state = state;
    this.subscribers = new Set();
    this.unsubscribe = this.client.subscribeEvents((event) => {
      this.dispatch(migrateAction(event.data as AnyVersionAction));
    });
  }

  static async connect(session: string, pass: string) {
    const client = await ApiClient.open("/api", session, pass);
    const actions = (await client.events()).map((e) => e.data as AnyVersionAction);
    const state = computeStateFromScratch(actions.map(migrateAction));
    return new Store(state, client);
  }

  cleanup() {
    this.unsubscribe();
  }

  async refreshState() {
    this.client.refreshWebSocket();
    const actions = (await this.client.events()).map((e) => e.data as AnyVersionAction);
    this.state = computeStateFromScratch(actions.map(migrateAction));
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

  async postEvent(action: Action) {
    const apiClientEvent: ClientEvent = {
      uuid: action.uuid,
      data: action,
    };
    this.dispatch(action);
    await this.client?.postEvent(apiClientEvent);
  }

  async writeBlob(id: string, data: Uint8Array<ArrayBuffer>) {
    await this.client?.putBlob(id, data);
  }

  async getBlob(id: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
    return this.client?.getBlob(id);
  }

  async finalize(replacementActions: Action[]) {
    const apiClientEvents: ClientEvent[] = replacementActions.map((action) => ({
      uuid: action.uuid,
      data: action,
    }));
    return this.client?.finalize(Array.from(this.state.processedActions.ids), apiClientEvents, []);
  }

  private callSubscribers() {
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }

  private dispatch(action: Action) {
    this.state = reducer(this.state, action);
    this.callSubscribers();
  }
}

function computeStateFromScratch(actions: Action[]): State {
  let state = initialState;
  for (const action of actions) {
    state = reducer(state, action);
  }
  return state;
}
