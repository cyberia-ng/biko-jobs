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
    eventStreamUnsubscribe?: () => void;
  };
  streams: Map<StreamName, Stream>;
  persistent: PersistentState;
  pendingTasks: Array<
    | { type: "stream action"; streamName: StreamName; uuid: EventUUID; data: StreamAction }
    | { type: "blob upload"; streamName: StreamName; uuid: BlobUUID; data: Bytes }
  >;
  outbox: Array<{ key: string; effect: Effect }>;
  errors: Array<{ key: string; timestamp: Temporal.Instant } & Error>;
};

export type Error =
  | { type: "effect error"; effect: Effect; error: unknown }
  | { type: "token refresh error"; error: unknown }
  | { type: "event stream error"; error: unknown };

export const initialState: State = {
  loginState: {
    masterKeys: "not loaded",
    login: { type: "not logged in" },
  },
  streams: new Map(),
  persistent: initialPersistentState,
  pendingTasks: [],
  outbox: [
    {
      key: crypto.randomUUID(),
      effect: {
        type: "login/load ephemeral auth token",
        after: (authToken) => [{ type: "login/log in to ephemeral session", authToken }],
      },
    },
    {
      key: crypto.randomUUID(),
      effect: {
        type: "login/fetch master public keys",
        after: (masterKeys) => [{ type: "login/update master keys list", masterKeys }],
      },
    },
  ],
  errors: [],
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
