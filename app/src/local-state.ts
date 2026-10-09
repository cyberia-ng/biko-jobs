import { produce } from "immer";
import { assertNever } from "./assertNever.ts";

export type LocalState = {
  loading: boolean;
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
  | { type: "edit job"; jobNumber: number };

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
      default:
        assertNever(action);
    }
  });
}

export const initialLocalState: LocalState = {
  loading: false,
  screen: { type: "session manager" },
};
