import { createContext } from "react";
import type { Action, LocalState } from "./local-state.ts";
import type { State } from "./state/state.ts";
import type { Store } from "./store.ts";

export type AppContextT = {
  state: State;
  store: Store;
  localState: LocalState;
  dispatchLocal: (action: Action) => void;
  withLoading: (p: Promise<void>) => void;
  refresh: () => void;
};
export const AppContext = createContext<AppContextT>(null as any);
