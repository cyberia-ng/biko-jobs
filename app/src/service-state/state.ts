import type {
  AuthToken,
  Bytes,
  MasterKeyPair,
  MasterKeyPublic,
  Stream,
} from "@biko-jobs/api-client";
import type { Effect } from "./effects.ts";
import {
  type State as PersistentState,
  initialState as initialPersistentState,
} from "./persistent/state.ts";
import type { StreamAction } from "./persistent/action.ts";
import type { WritableDraft } from "immer";

export type StreamName = string;
export type BlobUUID = string;
export type EventUUID = string;
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
  pendingTasks: Array<
    | { type: "stream action"; streamName: StreamName; uuid: EventUUID; data: StreamAction }
    | { type: "blob upload"; streamName: StreamName; uuid: BlobUUID; data: Bytes }
  >;
  outbox: Array<{ key: string; effect: Effect }>;
};

export const initialState: State = {
  loginState: {
    masterKeys: "not loaded",
    login: { type: "not logged in" },
  },
  streams: new Map(),
  persistent: initialPersistentState,
  pendingTasks: [],
  outbox: [
    { key: crypto.randomUUID(), effect: { type: "login/load ephemeral auth token" } },
    { key: crypto.randomUUID(), effect: { type: "login/fetch master public keys" } },
  ],
};

export function getAuthToken(state: State | WritableDraft<State>): AuthToken | undefined {
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
