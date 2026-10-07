import { createContext } from "react";
import type { Action, LocalState } from "./local-state.ts";
import type { State } from "./state/state.ts";
import type { Store } from "./store.ts";

export type WithLoading = <Args extends unknown[]>(
  p: (...args: Args) => Promise<void>,
) => (...args: Args) => void;
export type AppContextT = {
  state: State;
  store: Store;
  localState: LocalState;
  dispatchLocal: (action: Action) => void;
  withLoading: WithLoading;
};
export const AppContext = createContext<AppContextT>(null as any);
