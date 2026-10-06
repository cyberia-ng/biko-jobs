import { produce } from "immer";
import type { Action } from "./action.ts";
import type { State } from "./state.ts";
import pick from "lodash/pick.js";

export function reducer(state: State, action: Action): State {
  return produce(state, (state) => {
    state.push({
      status: "triaged",
      ...pick(action, ["customerName", "description", "images"]),
    });
  });
}
