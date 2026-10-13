import { createContext } from "react";
import type { Action as LocalAction, LocalState } from "./local-state.ts";
import type { State } from "./session-state/state.ts";
import type { Action as SessionAction } from "./session-state/action.ts";

export type AppContextT = {
  sessionsList: string[];
  session:
    | {
        state: State;
        dispatch: (a: SessionAction) => void;
        getBlob: (id: string) => Promise<Uint8Array<ArrayBuffer> | undefined>;
        writeBlob: (id: string, data: Uint8Array<ArrayBuffer>) => void;
      }
    | undefined;
  localState: LocalState;
  dispatchLocal: (action: LocalAction) => void;
  refresh: () => void;
};
export const AppContext = createContext<AppContextT>(null as any);
