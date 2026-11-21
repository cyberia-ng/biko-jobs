import { createContext } from "react";
import type { State } from "./service-state/state.ts";
import type { Action } from "./service-state/reducer.ts";
import type { State as NavigationState } from "./navigation/state.ts";
import type { Store as NavigationStore } from "./navigation/store.ts";
import type { Bytes } from "@biko-jobs/api-client";

export type AppContextT = {
  state: State;
  dispatch: (action: Action) => void;
  getBlob: (streamUUID: string, blobUUID: string) => Promise<Bytes | undefined>;
  navigationState: NavigationState;
  navigate: (state: NavigationState) => void;
  addNavigationHook: typeof NavigationStore.prototype.addHook;
};
export const AppContext = createContext<AppContextT>(null as any);
