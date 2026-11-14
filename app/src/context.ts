import { createContext } from "react";
import type { State as ServiceState } from "./service-state/state.ts";
import type { StreamAction } from "./service-state/action.ts";
import type { State as NavigationState } from "./navigation/state.ts";
import type { ApiClient, Bytes } from "@biko-jobs/api-client";
import type { Action as LoginAction, State as LoginState } from "./login-state.ts";
import type { Store as NavigationStore } from "./navigation/store.ts";

export type AppContextT = {
  loginState: LoginState;
  login: (a: LoginAction) => void;
  service: {
    state: ServiceState;
    dispatch: (action: StreamAction, streamName: string) => void;
    getBlob: (blobUUID: string, streamName: string) => Promise<Bytes | undefined>;
    putBlob: (blobUUID: string, streamName: string, data: Bytes) => Promise<void>;
    createJob: (uuid: string) => Promise<void>;
  };
  loading: boolean;
  navigationState: NavigationState;
  navigate: (state: NavigationState) => void;
  addNavigationHook: typeof NavigationStore.prototype.addHook;
  refresh: () => void;
  apiClient: ApiClient;
};
export const AppContext = createContext<AppContextT>(null as any);
