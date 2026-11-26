import {
  AuthToken,
  MasterKeyPair,
  MasterKeyPassword,
  MasterKeyPublic,
  type ApiClient,
  type StreamBlob,
  type StreamEvent,
  type WebSocketSubscriber,
} from "@biko-jobs/api-client";
import type { Action } from "./reducer.ts";
import { assertNever } from "../utilities/assert-never.ts";
import type { BlobUUID, State, StreamName } from "./state.ts";
import { makeThumbnail } from "../utilities/make-thumbnail.ts";

const AUTH_TOKEN_LIFETIME = Temporal.Duration.from({ minutes: 5 });

export type Effect =
  | { type: "login/fetch master public keys" }
  | { type: "login/load ephemeral auth token" }
  | { type: "login/persist ephemeral auth token"; authToken: AuthToken }
  | { type: "login/clear ephemeral auth token" }
  | { type: "login/perform password login"; masterKey: MasterKeyPublic; password: string }
  | { type: "login/refresh auth token"; masterKey: MasterKeyPair }
  | { type: "login/subscribe to events"; existingUnsubscribe: (() => void) | undefined }
  | {
      type: "persistent/fetch events by master key";
      masterKey: MasterKeyPair;
      authToken: AuthToken;
    }
  | { type: "persistent/post stream event"; event: StreamEvent; authToken: AuthToken }
  | { type: "blob/put blob"; blob: StreamBlob; authToken: AuthToken }
  | { type: "stream/create"; name: string; access: MasterKeyPublic[]; authToken: AuthToken }
  | {
      type: "photos/process photo";
      streamName: StreamName;
      fullSizeUUID: BlobUUID;
      thumbnailUUID: BlobUUID;
      blob: Blob;
    };

export type Effector = (
  effect: Effect,
  dispatch: (action: Action) => void,
  getSnapshot: () => State,
) => Promise<void>;
export function makeEffector(client: ApiClient): Effector {
  const effector: Effector = async (effect, dispatch, getSnapshot) => {
    switch (effect.type) {
      case "login/fetch master public keys": {
        const masterKeys = await client.listMasterKeys();
        const mks = masterKeys.map((mk) => ({
          key: mk,
          savedPassword: window.localStorage.getItem(`saved password/${mk.uuid}`) ?? undefined,
        }));
        dispatch({ type: "login/update master keys list", masterKeys: mks });
        break;
      }
      case "login/load ephemeral auth token": {
        const authTokenStr = window.sessionStorage.getItem("ephemeral auth token");
        if (authTokenStr === null) break;
        const authToken = AuthToken.fromStr(authTokenStr);
        dispatch({ type: "login/log in to ephemeral session", authToken });
        break;
      }
      case "login/persist ephemeral auth token": {
        window.sessionStorage.setItem("ephemeral auth token", effect.authToken.tokenStr);
        break;
      }
      case "login/clear ephemeral auth token": {
        window.sessionStorage.removeItem("ephemeral session");
        break;
      }
      case "login/perform password login": {
        // scrypt happens synchronously, so use setTimeout to make sure we
        // render new state before computing scrypt hash
        await new Promise((res) => setTimeout(res, 0));
        const mkPassword = await MasterKeyPassword.init(effect.masterKey, effect.password);
        const masterKey = await client.getMasterKeyPair(mkPassword);
        window.localStorage.setItem(`saved password/${masterKey.uuid}`, effect.password);
        dispatch({ type: "login/log in with key pair", masterKey });
        dispatch({ type: "login/refresh auth token" });
        break;
      }
      case "login/refresh auth token": {
        const authToken = await AuthToken.init({
          masterKey: effect.masterKey,
          expiry: Temporal.Now.instant().add(AUTH_TOKEN_LIFETIME),
          permissions: new Set([
            "list streams",
            "create streams",
            "read stream data",
            "write stream data",
          ]),
        });
        dispatch({ type: "login/receive refreshed auth token", authToken });
        const intervalMs = multiplyDuration(AUTH_TOKEN_LIFETIME, 0.9).total("milliseconds");
        setTimeout(() => dispatch({ type: "login/refresh auth token" }), intervalMs);
        break;
      }
      case "login/subscribe to events": {
        effect.existingUnsubscribe?.();
        await new Promise<void>((res, rej) => {
          let isConnected = false;
          const subscriber: WebSocketSubscriber = {
            getStream: (name) => getSnapshot().streams.get(name),
            getMasterKey: (uuid) => {
              const state = getSnapshot();
              if (
                state.loginState.login.type === "master key" &&
                state.loginState.login.masterKey.uuid === uuid
              ) {
                return state.loginState.login.masterKey;
              } else return undefined;
            },
            onConnect: () => {
              isConnected = true;
              res();
            },
            onEvent: (event) => {
              switch (event.type) {
                case "new stream": {
                  dispatch({
                    type: "persistent/merge streams",
                    streams: new Map([[event.stream.name, event.stream]]),
                  });
                  break;
                }
                case "stream event": {
                  dispatch({ type: "persistent/reduce incoming stream event", event: event.event });
                  break;
                }
                default:
                  assertNever(event);
              }
            },
            onError: (error) => {
              if (!isConnected) return rej(error);
              else {
                // Reconnect?
                dispatch({
                  type: "error/handle event stream error",
                  key: crypto.randomUUID(),
                  timestamp: Temporal.Now.instant(),
                  error,
                });
              }
            },
          };
          const unsubscribe = client.subscribeEvents(subscriber);
          dispatch({ type: "login/save event stream unsubscribe hook", unsubscribe });
        });
        break;
      }
      case "persistent/fetch events by master key": {
        const streams = await client.listStreams(effect.masterKey, effect.authToken);
        const events = await client.getEventsByStreams(streams, effect.authToken);
        dispatch({
          type: "persistent/merge streams",
          streams: new Map(streams.map((stream) => [stream.name, stream] as const)),
        });
        for (const streamEvents of events.values()) {
          for (const event of streamEvents) {
            dispatch({
              type: "persistent/reduce incoming stream event",
              event,
            });
          }
        }
        break;
      }
      case "persistent/post stream event": {
        await client.addEvent(effect.event, effect.authToken);
        break;
      }
      case "blob/put blob": {
        await client.putBlob(effect.blob, effect.authToken);
        break;
      }
      case "stream/create": {
        const stream = await client.addStream(
          { name: effect.name, access: effect.access },
          effect.authToken,
        );
        dispatch({ type: "persistent/merge streams", streams: new Map([[stream.name, stream]]) });
        break;
      }
      case "photos/process photo": {
        const thumbnail = await makeThumbnail(effect.blob);
        const fullSize = await effect.blob.bytes();
        dispatch({
          type: "photo/receive processed photo",
          streamName: effect.streamName,
          fullSize: {
            uuid: effect.fullSizeUUID,
            data: fullSize,
          },
          thumbnail: {
            uuid: effect.thumbnailUUID,
            data: thumbnail.data,
          },
        });
        break;
      }
      default:
        assertNever(effect);
    }
  };
  return (effect, dispatch, getSnapshot) =>
    effector(effect, dispatch, getSnapshot).catch((error) =>
      dispatch({
        type: "error/handle effect error",
        key: crypto.randomUUID(),
        timestamp: Temporal.Now.instant(),
        effect,
        error,
      }),
    );
}

function multiplyDuration(duration: Temporal.Duration, multiplier: number) {
  return Temporal.Duration.from({ microseconds: duration.total("microseconds") * multiplier });
}
