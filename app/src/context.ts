import { createContext } from "react";
import type { State as SessionState } from "./session-state/state.ts";
import type { Action as SessionAction } from "./session-state/action.ts";
import type { State as NavigationState } from "./navigation-state.ts";

export type LoginState = { session: string; password: string } | undefined;

export type AppContextT = {
  sessionsList: string[];
  loginState: LoginState;
  setLoginState: (state: LoginState) => void;
  session:
    | {
        state: SessionState;
        dispatch: (a: SessionAction) => void;
        getBlob: (id: string) => Promise<Uint8Array<ArrayBuffer> | undefined>;
        writeBlob: (id: string, data: Uint8Array<ArrayBuffer>) => void;
      }
    | undefined;
  loading: boolean;
  navigationState: NavigationState;
  navigate: (state: NavigationState) => void;
  refresh: () => void;
};
export const AppContext = createContext<AppContextT>(null as any);
