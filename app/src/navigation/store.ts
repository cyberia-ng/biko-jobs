import { useCallback, useMemo, useSyncExternalStore } from "react";
import { deserialize, initialState, serialize, type State } from "./state.ts";

export type Hook = (opts: { to: State; unhook: () => void }) => void | { prevent: boolean };

export class Store {
  subscribers: Set<() => void>;
  hooks: Set<Hook>;
  onHashChangeBound: (this: void) => void;
  state: State;

  constructor() {
    this.subscribers = new Set();
    this.hooks = new Set();
    this.onHashChangeBound = this.onHashChange.bind(this);
    this.state = deserialize(window.location.hash.replace(/^#?/, "")) ?? initialState;
  }

  subscribe(cb: () => void) {
    if (this.subscribers.size === 0) {
      window.addEventListener("hashchange", this.onHashChangeBound);
    }
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0) {
        window.removeEventListener("hashchange", this.onHashChangeBound);
      }
    };
  }

  addHook(hook: Hook): () => void {
    this.hooks.add(hook);
    return () => this.hooks.delete(hook);
  }

  getSnapshot() {
    return this.state;
  }

  navigate(to: State) {
    for (const hook of this.hooks) {
      const hookRet = hook({
        to,
        unhook: () => this.hooks.delete(hook),
      });
      if (hookRet !== undefined && hookRet.prevent) return;
    }
    const oldURL = location.href;

    const url = new URL(location.href);
    url.hash = serialize(to).replace(/^#?/, "");
    const newURL = url.href;

    if (newURL === oldURL) return;
    history.pushState(null, "", newURL);

    window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL }));
  }

  private onHashChange() {
    const newState = deserialize(window.location.hash.replace(/^#?/, ""));
    if (newState === undefined) {
      return;
    }
    this.state = newState;
    for (const subscriber of this.subscribers) subscriber();
  }
}

export function useNavigation() {
  const store = useMemo(() => new Store(), []);
  const state = useSyncExternalStore(
    useCallback((cb) => store.subscribe(cb), [store]),
    useCallback(() => store.getSnapshot(), [store]),
  );
  return [state, store] as const;
}
