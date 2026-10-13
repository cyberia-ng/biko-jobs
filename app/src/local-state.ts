import { produce } from "immer";
import { assertNever } from "./assertNever.ts";

export type LocalState = {
  loading: Set<string>;
  currentSession: { session: string; password: string } | undefined;
  screen:
    | {
        type: "session manager" | "kanban" | "new job";
      }
    | { type: "job detail"; uuid: string }
    | { type: "edit job"; uuid: string };
};

export type Navigate = { type: "navigate"; screen: "kanban" | "new job" | "session manager" };
export type Action =
  | { type: "set loading"; id: string }
  | { type: "done loading"; id: string }
  | Navigate
  | { type: "view job detail"; uuid: string }
  | { type: "edit job"; uuid: string }
  | { type: "set current session"; session: { session: string; password: string } | undefined };

export function reducer(state: LocalState, action: Action): LocalState {
  return produce(state, (state) => {
    switch (action.type) {
      case "set loading": {
        state.loading.add(action.id);
        break;
      }
      case "done loading": {
        state.loading.delete(action.id);
        break;
      }
      case "navigate": {
        state.screen = { type: action.screen };
        break;
      }
      case "view job detail": {
        state.screen = { type: "job detail", uuid: action.uuid };
        break;
      }
      case "edit job": {
        state.screen = { type: "edit job", uuid: action.uuid };
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
    loading: new Set(),
    currentSession,
    screen: { type: "session manager" },
  };
}

export const isLoading = (state: LocalState) => state.loading.size !== 0;
