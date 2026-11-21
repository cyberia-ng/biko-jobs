import {
  asyncReducer,
  initialState,
  type Action,
  type Effector,
  type State,
} from "./async-reducer.ts";

export class Store {
  private state: State;
  private inFlightEffects: Set<string>;
  private effector: Effector;
  private subscribers: Set<() => void>;

  constructor(effector: Effector) {
    this.state = initialState;
    this.inFlightEffects = new Set();
    this.subscribers = new Set();
    this.effector = effector;
    this.onStateChange();
  }

  private onStateChange() {
    (async () => {
      for (const effect of this.state.outbox) {
        if (this.inFlightEffects.has(effect.key)) continue;
        this.inFlightEffects.add(effect.key);
        const actions = await this.effector(this.state, effect);
        this.dispatchMultiple([...actions, { type: "outbox/effect processed", key: effect.key }]);
        this.inFlightEffects.delete(effect.key);
      }
    })();
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }

  dispatchMultiple(actions: Action[]) {
    for (const action of actions) {
      this.state = asyncReducer(this.state, action);
    }
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
}
