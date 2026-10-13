import { createContext } from "react";
import type { Action as LocalAction, State as LocalState } from "./local-state.ts";
import type { State as SessionState } from "./session-state/state.ts";
import type { Action as SessionAction } from "./session-state/action.ts";

export type AppContextT = {
  sessionsList: string[];
  session:
    | {
        state: SessionState;
        dispatch: (a: SessionAction) => void;
        getBlob: (id: string) => Promise<Uint8Array<ArrayBuffer> | undefined>;
        writeBlob: (id: string, data: Uint8Array<ArrayBuffer>) => void;
      }
    | undefined;
  loading: boolean;
  localState: LocalState;
  dispatchLocal: (action: LocalAction) => void;
  refresh: () => void;
};
export const AppContext = createContext<AppContextT>(null as any);
