import { AuthToken, type MasterKeyPair, type MasterKeyPublic } from "@biko-jobs/api-client";
import { produce } from "immer";
import { assertNever } from "./assert-never.ts";

export type State = {
  masterKeys: MasterKeyPublic[] | undefined;
  login:
    | {
        type: "master key";
        masterKey: MasterKeyPair;
      }
    | { type: "ephemeral"; authToken: AuthToken }
    | undefined;
};

export type Action =
  | { type: "update master keys list"; masterKeys: MasterKeyPublic[] }
  | { type: "log in with key pair"; masterKey: MasterKeyPair }
  | { type: "log in to ephemeral session"; authToken: AuthToken };

export function reducer(state: State, action: Action): State {
  return produce(state, (state) => {
    switch (action.type) {
      case "update master keys list":
        if (state === undefined) {
          return { masterKeys: action.masterKeys, login: undefined };
        } else {
          state.masterKeys = action.masterKeys;
        }
        break;
      case "log in with key pair":
        state.login = { type: "master key", masterKey: action.masterKey };
        window.sessionStorage.removeItem("ephemeral session");
        break;
      case "log in to ephemeral session":
        state.login = { type: "ephemeral", authToken: action.authToken };
        window.sessionStorage.setItem("ephemeral auth token", action.authToken.tokenStr);
        break;
      default:
        assertNever(action);
    }
  });
}

const ephemeralAuthToken = window.sessionStorage.getItem("ephemeral auth token");
export const initialState: State = {
  masterKeys: undefined,
  login:
    ephemeralAuthToken === null
      ? undefined
      : {
          type: "ephemeral",
          authToken: AuthToken.fromStr(ephemeralAuthToken),
        },
};
