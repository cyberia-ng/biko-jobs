import {
  AuthToken,
  Stream,
  type Bytes,
  type MasterKeyPair,
  type MasterKeyPublic,
  type StreamBlob,
  type StreamEvent,
} from "@biko-jobs/api-client";
import { produce, type WritableDraft } from "immer";
import {
  getAuthToken,
  initialState,
  type BlobUUID,
  type EventUUID,
  type State,
  type StreamName,
} from "./state.ts";
import type { Effect } from "./effects.ts";
import { assertNever } from "../utilities/assert-never.ts";
import { reducer as persistentReducer } from "./persistent/reducer.ts";
import type { AnyVersionStreamAction, StreamAction } from "./persistent/action.ts";
import { migrateAction } from "./persistent/stream-actions/migrate.ts";
import partition from "lodash/partition.js";

export type Action =
  | OutboxProcessed
  | LoginAction
  | RefreshAction
  | PersistentAction
  | PhotoAction
  | ErrorAction;
type OutboxProcessed = { type: "outbox/effect processed"; key: string };
type LoginAction =
  | {
      type: "login/update master keys list";
      masterKeys: Array<{ key: MasterKeyPublic; savedPassword: string | undefined }>;
    }
  | { type: "login/begin password login flow"; masterKey: MasterKeyPublic; password: string }
  | { type: "login/log in with key pair"; masterKey: MasterKeyPair }
  | { type: "login/refresh auth token" }
  | { type: "login/receive refreshed auth token"; authToken: AuthToken }
  | { type: "login/log in to ephemeral session"; authToken: AuthToken }
  | { type: "login/save event stream unsubscribe hook"; unsubscribe: () => void };
type RefreshAction = { type: "refresh" };
export type WrappedStreamAction = {
  action: StreamAction;
  streamName: StreamName;
  eventUUID: EventUUID;
};
type PersistentAction =
  | { type: "persistent/merge streams"; streams: Map<StreamName, Stream> }
  | { type: "persistent/reduce incoming stream event"; event: StreamEvent }
  | { type: "persistent/create stream"; name: string }
  | {
      type: "persistent/dispatch stream action";
      streamName: StreamName;
      eventUUID: EventUUID;
      action: StreamAction;
    };
type PhotoAction =
  | {
      type: "photo/process photo";
      streamName: StreamName;
      fullSizeUUID: BlobUUID;
      thumbnailUUID: BlobUUID;
      blob: Blob;
    }
  | {
      type: "photo/receive processed photo";
      streamName: StreamName;
      fullSize: {
        uuid: BlobUUID;
        data: Bytes;
      };
      thumbnail: {
        uuid: BlobUUID;
        data: Bytes;
      };
    };
type ErrorAction =
  | {
      type: "error/handle effect error";
      key: string;
      timestamp: Temporal.Instant;
      effect: Effect;
      error: unknown;
    }
  | {
      type: "error/handle event stream error";
      key: string;
      timestamp: Temporal.Instant;
      error: unknown;
    }
  | { type: "error/dismiss error"; key: string };

function effect(effect: Effect): State["outbox"][number] {
  return { key: crypto.randomUUID(), effect };
}

export function streamAction(streamName: StreamName, action: StreamAction): PersistentAction {
  return {
    type: "persistent/dispatch stream action",
    streamName,
    eventUUID: crypto.randomUUID(),
    action,
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
        };
        state.outbox.push(effect({ type: "login/clear ephemeral auth token" }));
        state.outbox.push(
          effect({
            type: "login/subscribe to events",
            existingUnsubscribe: state.loginState.eventStreamUnsubscribe,
          }),
        );
        break;
      case "login/log in to ephemeral session":
        state.loginState.login = { type: "ephemeral", authToken: action.authToken };
        state.outbox.push(
          effect({ type: "login/persist ephemeral auth token", authToken: action.authToken }),
        );
        state.outbox.push(
          effect({
            type: "login/subscribe to events",
            existingUnsubscribe: state.loginState.eventStreamUnsubscribe,
          }),
        );
        break;
      case "login/refresh auth token":
        if (outerState.loginState.login.type !== "master key") break;
        state.outbox.push(
          effect({
            type: "login/refresh auth token",
            masterKey: outerState.loginState.login.masterKey,
          }),
        );
        break;
      case "login/receive refreshed auth token":
        if (
          state.loginState.login.type !== "master key" ||
          outerState.loginState.login.type !== "master key"
        ) {
          break;
        }
        if (state.loginState.login.cachedAuthToken === undefined) {
          state.outbox.push(
            effect({
              type: "persistent/fetch events by master key",
              masterKey: outerState.loginState.login.masterKey,
              authToken: action.authToken,
            }),
          );
        }
        state.loginState.login.cachedAuthToken = action.authToken;
        break;
      case "login/save event stream unsubscribe hook":
        state.loginState.eventStreamUnsubscribe = action.unsubscribe;
        break;
      case "persistent/merge streams": {
        for (const [key, value] of action.streams.entries()) {
          state.streams.set(key, value);
        }
        const [availableTasks, remainingPendingTasks] = partition(outerState.pendingTasks, (e) =>
          state.streams.has(e.streamName),
        );
        state.pendingTasks = remainingPendingTasks;
        let persistentState = outerState.persistent;
        const authToken = getAuthToken(outerState);
        if (authToken === undefined) break;
        for (const task of availableTasks) {
          const stream = state.streams.get(task.streamName)!;
          switch (task.type) {
            case "stream action": {
              const event: StreamEvent<StreamAction> = {
                uuid: task.uuid,
                stream,
                data: task.data,
              };
              persistentState = persistentReducer(persistentState, event);
              state.outbox.push(
                effect({
                  type: "persistent/post stream event",
                  event,
                  authToken,
                }),
              );
              break;
            }
            case "blob upload": {
              state.outbox.push(
                effect({
                  type: "blob/put blob",
                  blob: { uuid: task.uuid, stream, data: task.data },
                  authToken,
                }),
              );
              break;
            }
            default:
              assertNever(task);
          }
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
          state.pendingTasks.push({
            type: "stream action",
            streamName: action.streamName,
            uuid: action.eventUUID,
            data: action.action,
          });
        } else {
          const authToken = getAuthToken(outerState);
          if (authToken === undefined) break;
          const event: StreamEvent<StreamAction> = {
            uuid: action.eventUUID,
            stream,
            data: action.action,
          };
          state.persistent = persistentReducer(state.persistent, event);
          state.outbox.push(
            effect({
              type: "persistent/post stream event",
              event,
              authToken,
            }),
          );
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
      case "photo/process photo": {
        state.outbox.push(
          effect({
            type: "photos/process photo",
            streamName: action.streamName,
            fullSizeUUID: action.fullSizeUUID,
            thumbnailUUID: action.thumbnailUUID,
            blob: action.blob,
          }),
        );
        break;
      }
      case "photo/receive processed photo": {
        doUploadBlob(state, action.streamName, action.fullSize.uuid, action.fullSize.data);
        doUploadBlob(state, action.streamName, action.thumbnail.uuid, action.thumbnail.data);
        break;
      }
      case "error/handle effect error":
        state.errors.push({
          type: "effect error",
          key: action.key,
          timestamp: action.timestamp,
          effect: action.effect,
          error: action.error,
        });
        break;
      case "error/handle event stream error":
        state.errors.push({
          type: "event stream error",
          key: action.key,
          timestamp: action.timestamp,
          error: action.error,
        });
        break;
      case "error/dismiss error":
        state.errors = state.errors.filter((e) => e.key !== action.key);
        break;
      default:
        assertNever(action);
    }
  });
}

function doUploadBlob(
  state: WritableDraft<State>,
  streamName: StreamName,
  blobUUID: BlobUUID,
  data: Bytes,
) {
  const authToken = getAuthToken(state);
  if (authToken === undefined) return;
  const stream = state.streams.get(streamName);
  if (stream === undefined) {
    state.pendingTasks.push({
      type: "blob upload",
      streamName: streamName,
      uuid: blobUUID,
      data,
    });
  } else {
    const blob: StreamBlob = { stream, uuid: blobUUID, data };
    state.outbox.push(effect({ type: "blob/put blob", blob, authToken }));
  }
}
