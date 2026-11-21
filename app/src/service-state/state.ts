import type { AuthToken, MasterKeyPair, MasterKeyPublic, Stream } from "@biko-jobs/api-client";
import type { Effect } from "./effects.ts";
import {
  type State as PersistentState,
  initialState as initialPersistentState,
} from "./persistent/state.ts";
import type { WrappedStreamAction } from "./reducer.ts";

export type StreamName = string;
export type BlobUUID = string;
export type State = {
  loginState: {
    masterKeys:
      | "not loaded"
      | Array<{
          key: MasterKeyPublic;
          savedPassword: string | undefined;
        }>;
    login:
      | { type: "loading" }
      | {
          type: "master key";
          masterKey: MasterKeyPair;
          cachedAuthToken: AuthToken;
        }
      | { type: "ephemeral"; authToken: AuthToken }
      | { type: "not logged in" };
  };
  streams: Map<StreamName, Stream>;
  persistent: PersistentState;
  pendingStreamActions: Array<WrappedStreamAction>;
  outbox: Array<{ key: string; effect: Effect }>;
};

export const initialState: State = {
  loginState: {
    masterKeys: "not loaded",
    login: { type: "not logged in" },
  },
  streams: new Map(),
  persistent: initialPersistentState,
  pendingStreamActions: [],
  outbox: [
    { key: crypto.randomUUID(), effect: { type: "login/load ephemeral auth token" } },
    { key: crypto.randomUUID(), effect: { type: "login/fetch master public keys" } },
  ],
};

export function getAuthToken(state: State): AuthToken | undefined {
  switch (state.loginState.login.type) {
    case "not logged in":
    case "loading":
      return undefined;
    case "master key":
      return state.loginState.login.cachedAuthToken;
    case "ephemeral":
      return state.loginState.login.authToken;
  }
}
