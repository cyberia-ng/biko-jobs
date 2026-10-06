import { produce } from "immer";

export type LocalState = {
  loading: boolean;
  screen: "kanban" | "new job";
};

export type Action =
  | { type: "set loading" }
  | { type: "done loading" }
  | { type: "navigate"; screen: LocalState["screen"] };

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
    }
  });
}

export const initialState: LocalState = {
  loading: false,
  screen: "kanban",
};
