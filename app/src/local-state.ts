import { produce } from "immer";
import { assertNever } from "./assertNever.ts";

export type LocalState = {
  loading: boolean;
  currentSession: { session: string; password: string } | undefined;
  screen:
    | {
        type: "session manager" | "kanban" | "new job";
      }
    | { type: "job detail"; jobNumber: number }
    | { type: "edit job"; jobNumber: number };
};

export type Navigate = { type: "navigate"; screen: "kanban" | "new job" | "session manager" };
export type Action =
  | { type: "set loading" }
  | { type: "done loading" }
  | Navigate
  | { type: "view job detail"; jobNumber: number }
  | { type: "edit job"; jobNumber: number }
  | { type: "set current session"; session: { session: string; password: string } | undefined };

export function reducer(state: LocalState, action: Action): LocalState {
  return produce(state, (state) => {
    switch (action.type) {
      case "set loading": {
        state.loading = true;
        break;
      }
      case "done loading": {
        state.loading = false;
        break;
      }
      case "navigate": {
        state.screen = { type: action.screen };
        break;
      }
      case "view job detail": {
        state.screen = { type: "job detail", jobNumber: action.jobNumber };
        break;
      }
      case "edit job": {
        state.screen = { type: "edit job", jobNumber: action.jobNumber };
        break;
      }
      case "set current session": {
        state.currentSession = action.session;
        break;
      }
      default:
        assertNever(action);
    }
  });
}

export function initialLocalState(hashFragment: string): LocalState {
  let hashData = hashFragment;
  if (hashData[0] === "#") {
    hashData = hashData.slice(1);
  }
  let currentSession: { session: string; password: string } | undefined;
  try {
    const parsed = JSON.parse(atob(hashData));
    currentSession = { session: parsed.session, password: parsed.password };
    // oxlint-disable-next-line no-unused-vars
  } catch (e) {
    currentSession = undefined;
  }
  return {
    loading: false,
    currentSession,
    screen: { type: "session manager" },
  };
}
