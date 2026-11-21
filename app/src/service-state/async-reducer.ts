import {
  AuthToken,
  type ApiClient,
  type MasterKeyPair,
  type MasterKeyPublic,
  type Stream,
} from "@biko-jobs/api-client";
import { type State as InnerState, initialState as initialInnerState } from "./state.ts";
import { produce } from "immer";

type StreamName = string;

export type Effect = { key: string } & (
  | { type: "login/fetch master public keys" }
  | { type: "login/load ephemeral auth token" }
  | { type: "login/persist ephemeral auth token" }
  | { type: "login/clear ephemeral auth token" }
);

export type State = {
  loginState: {
    masterKeys: MasterKeyPublic[] | undefined;
    login:
      | {
          type: "master key";
          masterKey: MasterKeyPair;
          cachedAuthToken: AuthToken;
        }
      | { type: "ephemeral"; authToken: AuthToken }
      | undefined;
    // | { type: "not logged in" };
  };
  streams: Map<StreamName, Stream>;
  inner: InnerState;
  outbox: Effect[];
};

export const initialState: State = {
  loginState: { masterKeys: undefined, login: undefined },
  streams: new Map(),
  inner: initialInnerState,
  outbox: [
    { key: crypto.randomUUID(), type: "login/load ephemeral auth token" },
    { key: crypto.randomUUID(), type: "login/fetch master public keys" },
  ],
};

export type Action = OutboxProcessed | LoginAction;
type OutboxProcessed = { type: "outbox/effect processed"; key: string };
type LoginAction =
  | { type: "login/update master keys list"; masterKeys: MasterKeyPublic[] }
  | { type: "login/log in with key pair"; masterKey: MasterKeyPair; authToken: AuthToken }
  | { type: "login/log in to ephemeral session"; authToken: AuthToken };

export function asyncReducer(state: State, action: Action): State {
  return produce(state, (state) => {
    switch (action.type) {
      case "outbox/effect processed":
        state.outbox = state.outbox.filter(({ key }) => key !== action.key);
        break;
      case "login/update master keys list":
        state.loginState.masterKeys = action.masterKeys;
        break;
      case "login/log in with key pair":
        state.loginState.login = {
          type: "master key",
          masterKey: action.masterKey,
          cachedAuthToken: action.authToken,
        };
        state.outbox.push({ key: crypto.randomUUID(), type: "login/clear ephemeral auth token" });
        break;
      case "login/log in to ephemeral session":
        state.loginState.login = { type: "ephemeral", authToken: action.authToken };
        state.outbox.push({ key: crypto.randomUUID(), type: "login/persist ephemeral auth token" });
    }
  });
}

export type Effector = (state: State, effect: Effect) => Promise<Action[]>;
export function makeEffector(client: ApiClient): Effector {
  return async (state, effect) => {
    switch (effect.type) {
      case "login/fetch master public keys": {
        const masterKeys = await client.listMasterKeys();
        return [{ type: "login/update master keys list", masterKeys: masterKeys }];
      }
      case "login/load ephemeral auth token": {
        const authTokenStr = window.sessionStorage.getItem("ephemeral auth token");
        if (authTokenStr === null) return [];
        const authToken = AuthToken.fromStr(authTokenStr);
        return [{ type: "login/log in to ephemeral session", authToken }];
      }
      case "login/persist ephemeral auth token": {
        if (state.loginState.login.type !== "ephemeral") return [];
        window.sessionStorage.setItem(
          "ephemeral auth token",
          state.loginState.login.authToken.tokenStr,
        );
        return [];
      }
      case "login/clear ephemeral auth token": {
        window.sessionStorage.removeItem("ephemeral session");
        return [];
      }
    }
  };
}
