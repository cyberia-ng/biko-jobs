import { createContext } from "react";
import type { State as ServiceState } from "./service-state/state.ts";
import type { Action as ServiceAction } from "./service-state/action.ts";
import type { State as NavigationState } from "./navigation-state.ts";
import type { Bytes } from "@biko-jobs/api-client";

export type LoginState = { masterKey: { uuid: string; password: string } } | undefined;

export type AppContextT = {
  loginState: LoginState;
  setLoginState: (state: LoginState) => void;
  service:
    | {
        state: ServiceState;
        dispatch: (a: ServiceAction) => void;
        getBlob: (blobUUID: string, jobUUID: string) => Promise<Bytes | undefined>;
        putBlob: (blobUUID: string, jobUUID: string, data: Bytes) => Promise<void>;
        createJob: (uuid: string) => Promise<void>;
      }
    | undefined;
  loading: boolean;
  navigationState: NavigationState;
  navigate: (state: NavigationState) => void;
  refresh: () => void;
};
export const AppContext = createContext<AppContextT>(null as any);
