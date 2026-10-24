import type { AuthToken, MasterKeyPair, MasterKeyPublic } from "@biko-jobs/api-client";
import { produce } from "immer";
import { assertNever } from "./assertNever.ts";

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
        break;
      case "log in to ephemeral session":
        state.login = { type: "ephemeral", authToken: action.authToken };
        break;
      default:
        assertNever(action);
    }
  });
}

export const initialState: State = {
  masterKeys: undefined,
  login: undefined,
};
