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
  | { type: "persistent/add stream"; stream: Stream }
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

export function reducer(state: State, action: Action): State {
  return produce(state, (draft) => {
    switch (action.type) {
      case "refresh":
        draft.persistent = initialState.persistent;
        draft.streams = initialState.streams;
        if (
          draft.loginState.login.type === "master key" &&
          state.loginState.login.type === "master key"
        ) {
          delete draft.loginState.login.cachedAuthToken;
          draft.outbox.push(effect(refreshAuthToken(state.loginState.login.masterKey)));
        } else if (draft.loginState.login.type === "ephemeral") {
          // TODO
        }
        draft.outbox.push(effect(subscribeToEvents(draft.loginState.eventStreamUnsubscribe)));
        break;
      case "outbox/effect processed":
        draft.outbox = draft.outbox.filter(({ key }) => key !== action.key);
        break;
      case "login/update master keys list":
        draft.loginState.masterKeys = action.masterKeys;
        break;
      case "login/begin password login flow":
        draft.loginState.login = { type: "loading" };
        draft.outbox.push(
          effect({
            type: "login/perform password login",
            masterKey: action.masterKey,
            password: action.password,
            after: (masterKey) => [
              { type: "login/log in with key pair", masterKey },
              { type: "login/refresh auth token" },
            ],
          }),
        );
        break;
      case "login/log in with key pair":
        draft.loginState.login = {
          type: "master key",
          masterKey: action.masterKey,
        };
        draft.outbox.push(effect({ type: "login/clear ephemeral auth token" }));
        draft.outbox.push(effect(subscribeToEvents(draft.loginState.eventStreamUnsubscribe)));
        break;
      case "login/log in to ephemeral session":
        draft.loginState.login = { type: "ephemeral", authToken: action.authToken };
        draft.outbox.push(
          effect({ type: "login/persist ephemeral auth token", authToken: action.authToken }),
        );
        draft.outbox.push(effect(subscribeToEvents(draft.loginState.eventStreamUnsubscribe)));
        break;
      case "login/refresh auth token":
        if (state.loginState.login.type !== "master key") break;
        draft.outbox.push(effect(refreshAuthToken(state.loginState.login.masterKey)));
        break;
      case "login/receive refreshed auth token":
        if (
          draft.loginState.login.type !== "master key" ||
          state.loginState.login.type !== "master key"
        ) {
          break;
        }
        if (draft.loginState.login.cachedAuthToken === undefined) {
          draft.outbox.push(
            effect({
              type: "persistent/fetch events by master key",
              masterKey: state.loginState.login.masterKey,
              authToken: action.authToken,
              after: ({ streams, events }) => [
                ...streams.map((stream): Action => ({ type: "persistent/add stream", stream })),
                ...events.map((event): Action => ({
                  type: "persistent/reduce incoming stream event",
                  event,
                })),
              ],
            }),
          );
        }
        draft.loginState.login.cachedAuthToken = action.authToken;
        break;
      case "login/save event stream unsubscribe hook":
        draft.loginState.eventStreamUnsubscribe = action.unsubscribe;
        break;
      case "persistent/add stream": {
        draft.streams.set(action.stream.name, action.stream);
        const [availableTasks, remainingPendingTasks] = partition(state.pendingTasks, (e) =>
          draft.streams.has(e.streamName),
        );
        draft.pendingTasks = remainingPendingTasks;
        let persistentState = state.persistent;
        const authToken = getAuthToken(state);
        if (authToken === undefined) break;
        for (const task of availableTasks) {
          const stream = draft.streams.get(task.streamName)!;
          switch (task.type) {
            case "stream action": {
              const event: StreamEvent<StreamAction> = {
                uuid: task.uuid,
                stream,
                data: task.data,
              };
              persistentState = persistentReducer(persistentState, event);
              draft.outbox.push(
                effect({
                  type: "persistent/post stream event",
                  event,
                  authToken,
                }),
              );
              break;
            }
            case "blob upload": {
              draft.outbox.push(
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
        draft.persistent = persistentState;
        break;
      }
      case "persistent/reduce incoming stream event":
        const migrated = migrateAction(action.event.data as AnyVersionStreamAction);
        let persistentState = state.persistent;
        for (const persistentAction of migrated) {
          const typedEvent: StreamEvent<StreamAction> = {
            ...action.event,
            data: persistentAction,
          };
          persistentState = persistentReducer(persistentState, typedEvent);
        }
        draft.persistent = persistentState;
        break;
      case "persistent/dispatch stream action":
        const stream = state.streams.get(action.streamName);
        if (stream === undefined) {
          draft.pendingTasks.push({
            type: "stream action",
            streamName: action.streamName,
            uuid: action.eventUUID,
            data: action.action,
          });
        } else {
          const authToken = getAuthToken(state);
          if (authToken === undefined) break;
          const event: StreamEvent<StreamAction> = {
            uuid: action.eventUUID,
            stream,
            data: action.action,
          };
          draft.persistent = persistentReducer(draft.persistent, event);
          draft.outbox.push(
            effect({
              type: "persistent/post stream event",
              event,
              authToken,
            }),
          );
        }
        break;
      case "persistent/create stream": {
        const authToken = getAuthToken(state);
        if (authToken === undefined) break;
        if (state.loginState.masterKeys === "not loaded") break;
        draft.outbox.push(
          effect({
            type: "stream/create",
            name: action.name,
            access: state.loginState.masterKeys.map((mk) => mk.key),
            authToken,
            after: (stream) => [{ type: "persistent/add stream", stream }],
          }),
        );
        break;
      }
      case "photo/process photo": {
        draft.outbox.push(
          effect({
            type: "photos/process photo",
            streamName: action.streamName,
            fullSizeUUID: action.fullSizeUUID,
            thumbnailUUID: action.thumbnailUUID,
            blob: action.blob,
            after: ({ streamName, fullSize, thumbnail }) => [
              { type: "photo/receive processed photo", streamName, fullSize, thumbnail },
            ],
          }),
        );
        break;
      }
      case "photo/receive processed photo": {
        doUploadBlob(draft, action.streamName, action.fullSize.uuid, action.fullSize.data);
        doUploadBlob(draft, action.streamName, action.thumbnail.uuid, action.thumbnail.data);
        break;
      }
      case "error/handle effect error":
        draft.errors.push({
          type: "effect error",
          key: action.key,
          timestamp: action.timestamp,
          effect: action.effect,
          error: action.error,
        });
        break;
      case "error/handle event stream error":
        draft.errors.push({
          type: "event stream error",
          key: action.key,
          timestamp: action.timestamp,
          error: action.error,
        });
        break;
      case "error/dismiss error":
        draft.errors = draft.errors.filter((e) => e.key !== action.key);
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

function subscribeToEvents(existingUnsubscribe?: () => void): Effect {
  return {
    type: "login/subscribe to events",
    existingUnsubscribe,
    after: ({ unsubscribe }) => [{ type: "login/save event stream unsubscribe hook", unsubscribe }],
    onEvent: (event) => {
      switch (event.type) {
        case "new stream": {
          return [
            {
              type: "persistent/add stream",
              stream: event.stream,
            },
          ];
        }
        case "stream event": {
          return [
            {
              type: "persistent/reduce incoming stream event",
              event: event.event,
            },
          ];
        }
        default:
          assertNever(event);
      }
    },
    onError: ({ key, timestamp, error }) => [
      {
        type: "error/handle event stream error",
        key,
        timestamp,
        error,
      },
    ],
  };
}

function refreshAuthToken(masterKey: MasterKeyPair): Effect {
  return {
    type: "login/refresh auth token",
    masterKey,
    after: (authToken) => [{ type: "login/receive refreshed auth token", authToken }],
    onExpire: () => [{ type: "login/refresh auth token" }],
  };
}
