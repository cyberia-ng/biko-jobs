import { ApiClient } from "@biko-jobs/api-client";
import { reducer } from "./state/reducer.ts";
import { initialState, type State } from "./state/state.ts";
import type { Action } from "./state/action.ts";

export class Store {
  private client?: ApiClient;
  private state: State;
  private subscribers: Set<() => void>;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.state = initialState;
    this.subscribers = new Set();
  }

  async connect(session: string, pass: string) {
    if (this.client !== undefined) {
      this.client.closeWebSocket();
    }
    this.client = await ApiClient.open(this.baseUrl, session, pass);
    this.client.subscribeEvents((event) => {
      this.dispatch(event as Action);
    });
    this.dispatch({ type: "set current session", sessionId: session });
  }

  async refreshState() {
    const sessionsList = await ApiClient.listSessions(this.baseUrl);
    this.dispatch({ type: "update sessions list", sessions: sessionsList });
    if (this.client !== undefined) {
      const actions = (await this.client.events()) as Action[];
      this.state = reducer(this.state, { type: "reset session" });
      for (const action of actions) {
        this.state = reducer(this.state, action);
      }
    }
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
    await this.client?.postEvent(action);
  }

  async writeBlob(id: string, data: Uint8Array<ArrayBuffer>) {
    await this.client?.putBlob(id, data);
  }

  async getBlob(id: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
    return this.client?.getBlob(id);
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
