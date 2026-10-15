import { produce } from "immer";
import { assertNever } from "./assertNever.ts";

export type State = {
  loginState:
    | { type: "logged in"; session: string; password: string }
    | { type: "key exchange"; session: string; serverPublicKeyB64: string }
    | { type: "not logged in" };
  screen:
    | {
        type: "session manager" | "kanban" | "new job";
      }
    | { type: "job detail"; uuid: string }
    | { type: "edit job"; uuid: string }
    | { type: "export" };
};

export type Navigate = {
  type: "navigate";
  screen: "kanban" | "new job" | "session manager" | "export";
};
export type Action =
  | Navigate
  | { type: "view job detail"; uuid: string }
  | { type: "edit job"; uuid: string }
  | { type: "log in"; session: string; password: string }
  | { type: "cancel key exchange" };

export function reducer(state: State, action: Action): State {
  return produce(state, (state) => {
    switch (action.type) {
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
      case "log in": {
        state.loginState = {
          type: "logged in",
          session: action.session,
          password: action.password,
        };
        break;
      }
      case "cancel key exchange": {
        state.loginState = { type: "not logged in" };
        break;
      }
      default:
        assertNever(action);
    }
  });
}

export const initialState: State = {
  loginState: { type: "not logged in" },
  screen: { type: "session manager" },
};

export function deserialize(hash: string): State {
  if (hash.length === 0 || hash === "#") {
    return initialState;
  }
  try {
    return JSON.parse(decodeURIComponent(hash.slice(1)));
    // oxlint-disable-next-line no-unused-vars
  } catch (e) {
    return initialState;
  }
}

export function serialize(state: State): string {
  return encodeURIComponent(JSON.stringify(state));
}
