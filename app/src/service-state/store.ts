import type { ApiClient, Bytes } from "@biko-jobs/api-client";
import type { Effector } from "./effects.ts";
import { reducer, type Action } from "./reducer.ts";
import { getAuthToken, type State } from "./state.ts";

export class Store {
  private state: State;
  private inFlightEffects: Set<string>;
  private effector: Effector;
  private subscribers: Set<() => void>;
  private apiGetBlob: ApiClient["getBlob"];

  constructor(effector: Effector, getBlob: ApiClient["getBlob"], initialState: State) {
    this.state = initialState;
    this.inFlightEffects = new Set();
    this.subscribers = new Set();
    this.effector = effector;
    this.apiGetBlob = getBlob;
    this.onStateChange();
  }

  private onStateChange() {
    for (const subscriber of this.subscribers) {
      subscriber();
    }
    (async () => {
      for (const item of this.state.outbox) {
        if (this.inFlightEffects.has(item.key)) continue;
        this.inFlightEffects.add(item.key);
        await this.effector(item.effect, this.dispatch.bind(this));
        this.dispatch({ type: "outbox/effect processed", key: item.key });
        this.inFlightEffects.delete(item.key);
      }
    })().catch(console.error);
  }

  dispatch(action: Action) {
    this.state = reducer(this.state, action);
    this.onStateChange();
  }

  getSnapshot() {
    return this.state;
  }

  subscribe(cb: () => void) {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  async getBlob(streamUUID: string, blobUUID: string): Promise<Bytes | undefined> {
    const stream = this.state.streams.get(streamUUID);
    const authToken = getAuthToken(this.state);
    if (stream === undefined || authToken === undefined) return undefined;
    const blob = await this.apiGetBlob(blobUUID, stream, authToken);
    return blob?.data;
  }
}
