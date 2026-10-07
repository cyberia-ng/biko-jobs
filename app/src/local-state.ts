import { produce } from "immer";

export type LocalState = {
  loading: boolean;
  screen: "kanban" | "new job" | "job detail";
};

export type Navigate = { type: "navigate"; screen: "kanban" | "new job" };
export type Action =
  | { type: "set loading" }
  | { type: "done loading" }
  | Navigate
  | { type: "view job detail" };

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
        state.screen = action.screen;
        break;
      }
      case "view job detail": {
        state.screen = "job detail";
        break;
      }
      default:
        assertNever(action);
    }
  });
}

export const initialState: LocalState = {
  loading: false,
  screen: "kanban",
};

function assertNever(a: never): never {
  return a;
}
