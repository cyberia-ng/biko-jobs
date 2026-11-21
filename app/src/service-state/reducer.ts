import {
  AuthToken,
  Stream,
  type Bytes,
  type MasterKeyPair,
  type MasterKeyPublic,
  type StreamBlob,
  type StreamEvent,
} from "@biko-jobs/api-client";
import { produce } from "immer";
import { getAuthToken, initialState, type BlobUUID, type State, type StreamName } from "./state.ts";
import type { Effect } from "./effects.ts";
import { assertNever } from "../utilities/assert-never.ts";
import { reducer as persistentReducer } from "./persistent/reducer.ts";
import type { AnyVersionStreamAction, StreamAction } from "./persistent/action.ts";
import { migrateAction } from "./persistent/stream-actions/migrate.ts";
import partition from "lodash/partition.js";
import { type State as PersistentState } from "./persistent/state.ts";

export type Action = OutboxProcessed | LoginAction | RefreshAction | PersistentAction;
type OutboxProcessed = { type: "outbox/effect processed"; key: string };
type LoginAction =
  | {
      type: "login/update master keys list";
      masterKeys: Array<{ key: MasterKeyPublic; savedPassword: string | undefined }>;
    }
  | { type: "login/begin password login flow"; masterKey: MasterKeyPublic; password: string }
  | { type: "login/log in with key pair"; masterKey: MasterKeyPair; authToken: AuthToken }
  | { type: "login/log in to ephemeral session"; authToken: AuthToken };
type RefreshAction = { type: "refresh" };
export type WrappedStreamAction = {
  action: StreamAction;
  streamName: StreamName;
  actionUUID: string;
  associatedBlobs: Map<BlobUUID, Bytes>;
};
type PersistentAction =
  | { type: "persistent/fetch events by master key" }
  | { type: "persistent/merge streams"; streams: Map<StreamName, Stream> }
  | { type: "persistent/reduce incoming stream event"; event: StreamEvent }
  | ({
      type: "persistent/dispatch stream action";
    } & WrappedStreamAction)
  | { type: "persistent/create stream"; name: string };

function effect(effect: Effect): State["outbox"][number] {
  return { key: crypto.randomUUID(), effect };
}

export function streamAction(
  streamName: StreamName,
  action: StreamAction,
  associatedBlobs?: Map<BlobUUID, Bytes>,
): PersistentAction {
  return {
    type: "persistent/dispatch stream action",
    streamName,
    actionUUID: crypto.randomUUID(),
    action,
    associatedBlobs: associatedBlobs ?? new Map(),
  };
}

export function reducer(outerState: State, action: Action): State {
  return produce(outerState, (state) => {
    switch (action.type) {
      case "refresh":
        return initialState;
      case "outbox/effect processed":
        state.outbox = state.outbox.filter(({ key }) => key !== action.key);
        break;
      case "login/update master keys list":
        state.loginState.masterKeys = action.masterKeys;
        break;
      case "login/begin password login flow":
        state.loginState.login = { type: "loading" };
        state.outbox.push(
          effect({
            type: "login/perform password login",
            masterKey: action.masterKey,
            password: action.password,
          }),
        );
        break;
      case "login/log in with key pair":
        state.loginState.login = {
          type: "master key",
          masterKey: action.masterKey,
          cachedAuthToken: action.authToken,
        };
        state.outbox.push(effect({ type: "login/clear ephemeral auth token" }));
        break;
      case "login/log in to ephemeral session":
        state.loginState.login = { type: "ephemeral", authToken: action.authToken };
        state.outbox.push(
          effect({ type: "login/persist ephemeral auth token", authToken: action.authToken }),
        );
        break;
      case "persistent/fetch events by master key":
        if (outerState.loginState.login.type !== "master key") return state;
        state.outbox.push(
          effect({
            type: "persistent/fetch events by master key",
            masterKey: outerState.loginState.login.masterKey,
            authToken: outerState.loginState.login.cachedAuthToken,
          }),
        );
        break;
      case "persistent/merge streams": {
        for (const [key, value] of action.streams.entries()) {
          state.streams.set(key, value);
        }
        const [availableActions, remainingActions] = partition(
          outerState.pendingStreamActions,
          (a) => state.streams.has(a.streamName),
        );
        state.pendingStreamActions = remainingActions;
        let persistentState = outerState.persistent;
        const authToken = getAuthToken(outerState);
        if (authToken === undefined) break;
        for (const action of availableActions) {
          const stream = state.streams.get(action.streamName)!;
          const { newState, effects } = handleStreamAction(
            persistentState,
            action,
            stream,
            authToken,
          );
          persistentState = newState;
          state.outbox.push(...effects.map((e) => effect(e)));
        }
        state.persistent = persistentState;
        break;
      }
      case "persistent/reduce incoming stream event":
        const migrated = migrateAction(action.event.data as AnyVersionStreamAction);
        let persistentState = outerState.persistent;
        for (const persistentAction of migrated) {
          const typedEvent: StreamEvent<StreamAction> = {
            ...action.event,
            data: persistentAction,
          };
          persistentState = persistentReducer(persistentState, typedEvent);
        }
        state.persistent = persistentState;
        break;
      case "persistent/dispatch stream action":
        const stream = outerState.streams.get(action.streamName);
        if (stream === undefined) {
          state.pendingStreamActions.push({
            streamName: action.streamName,
            actionUUID: action.actionUUID,
            action: action.action,
            associatedBlobs: action.associatedBlobs,
          });
        } else {
          const authToken = getAuthToken(outerState);
          if (authToken === undefined) break;
          const { newState, effects } = handleStreamAction(
            outerState.persistent,
            action,
            stream,
            authToken,
          );
          state.persistent = newState;
          state.outbox.push(...effects.map((e) => effect(e)));
        }
        break;
      case "persistent/create stream": {
        const authToken = getAuthToken(outerState);
        if (authToken === undefined) break;
        if (outerState.loginState.masterKeys === "not loaded") break;
        state.outbox.push(
          effect({
            type: "stream/create",
            name: action.name,
            access: outerState.loginState.masterKeys.map((mk) => mk.key),
            authToken,
          }),
        );
        break;
      }
      default:
        assertNever(action);
    }
  });
}

function handleStreamAction(
  persistentState: PersistentState,
  action: WrappedStreamAction,
  stream: Stream,
  authToken: AuthToken,
): { newState: PersistentState; effects: Effect[] } {
  const effects: Effect[] = [];
  const event: StreamEvent<StreamAction> = {
    uuid: action.actionUUID,
    stream,
    data: action.action,
  };
  const newState = persistentReducer(persistentState, event);
  effects.push({
    type: "persistent/post stream event",
    event,
    authToken,
  });
  for (const [blobUUID, data] of action.associatedBlobs.entries()) {
    const blob: StreamBlob = {
      uuid: blobUUID,
      data,
      stream,
    };
    effects.push({
      type: "blob/put blob",
      blob,
      authToken,
    });
  }
  return { newState, effects };
}
