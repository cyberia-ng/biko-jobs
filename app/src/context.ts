import { createContext } from "react";
import type { State as ServiceState } from "./service-state/state.ts";
import type { StreamAction } from "./service-state/action.ts";
import type { State as NavigationState } from "./navigation-state.ts";
import type { ApiClient, Bytes } from "@biko-jobs/api-client";
import type { Action as LoginAction, State as LoginState } from "./login-state.ts";
import type { addNavigationHook } from "./use-hash-location.ts";

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
  addNavigationHook: typeof addNavigationHook;
  refresh: () => void;
  apiClient: ApiClient;
};
export const AppContext = createContext<AppContextT>(null as any);
