import {
  AuthToken,
  MasterKeyPair,
  MasterKeyPassword,
  MasterKeyPublic,
  Stream,
  type ApiClient,
  type Bytes,
  type StreamBlob,
  type StreamEvent,
  type SubscriptionEvent,
  type WebSocketSubscriber,
} from "@biko-jobs/api-client";
import type { Action } from "./reducer.ts";
import type { BlobUUID, State, StreamName } from "./state.ts";
import { makeThumbnail } from "../utilities/make-thumbnail.ts";

const AUTH_TOKEN_LIFETIME = Temporal.Duration.from({ minutes: 5 });
const AUTH_TOKEN_REFRESH_INTERVAL = Temporal.Duration.from({
  microseconds: AUTH_TOKEN_LIFETIME.total("microseconds") * 0.9,
});

export type ActionCreator<T> = (arg: T) => Action[];

export type Effect =
  | {
      type: "login/fetch master public keys";
      after: ActionCreator<Exclude<State["loginState"]["masterKeys"], "not loaded">>;
    }
  | { type: "login/load ephemeral auth token"; after: ActionCreator<AuthToken> }
  | { type: "login/persist ephemeral auth token"; authToken: AuthToken }
  | { type: "login/clear ephemeral auth token" }
  | {
      type: "login/perform password login";
      masterKey: MasterKeyPublic;
      password: string;
      after: ActionCreator<{
        masterKey: MasterKeyPair;
        authToken: AuthToken;
      }>;
      onTokenExpire: ActionCreator<void>;
    }
  | {
      type: "login/refresh auth token";
      masterKey: MasterKeyPair;
      after: ActionCreator<AuthToken>;
      onExpire: ActionCreator<void>;
    }
  | {
      type: "login/subscribe to events";
      existingUnsubscribe: (() => void) | undefined;
      after: ActionCreator<{ unsubscribe: () => void }>;
      onEvent: ActionCreator<SubscriptionEvent>;
      onError: ActionCreator<{ key: string; timestamp: Temporal.Instant; error: unknown }>;
    }
  | {
      type: "persistent/fetch events by master key";
      masterKey: MasterKeyPair;
      authToken: AuthToken;
      after: ActionCreator<{ streams: Stream[]; events: StreamEvent[] }>;
    }
  | { type: "persistent/post stream event"; event: StreamEvent; authToken: AuthToken }
  | { type: "blob/put blob"; blob: StreamBlob; authToken: AuthToken }
  | {
      type: "stream/create";
      name: string;
      access: MasterKeyPublic[];
      authToken: AuthToken;
      after: ActionCreator<Stream>;
    }
  | {
      type: "photos/process photo";
      streamName: StreamName;
      fullSizeUUID: BlobUUID;
      thumbnailUUID: BlobUUID;
      blob: Blob;
      after: ActionCreator<{
        streamName: StreamName;
        fullSize: { uuid: BlobUUID; data: Bytes };
        thumbnail: { uuid: BlobUUID; data: Bytes };
      }>;
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
        effect.after(mks).forEach(dispatch);
        break;
      }
      case "login/load ephemeral auth token": {
        const authTokenStr = window.sessionStorage.getItem("ephemeral auth token");
        if (authTokenStr === null) break;
        const authToken = AuthToken.fromStr(authTokenStr);
        effect.after(authToken).forEach(dispatch);
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
        const authToken = await generateAuthToken(masterKey);
        window.localStorage.setItem(`saved password/${masterKey.uuid}`, effect.password);
        setInterval(
          () => effect.onTokenExpire().forEach(dispatch),
          AUTH_TOKEN_REFRESH_INTERVAL.total("milliseconds"),
        );
        effect.after({ masterKey, authToken }).forEach(dispatch);
        break;
      }
      case "login/refresh auth token": {
        const authToken = await generateAuthToken(effect.masterKey);
        effect.after(authToken).forEach(dispatch);
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
              effect.onEvent(event).forEach(dispatch);
            },
            onError: (error) => {
              if (!isConnected) return rej(error);
              else {
                effect
                  .onError({ key: crypto.randomUUID(), timestamp: Temporal.Now.instant(), error })
                  .forEach(dispatch);
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
        effect.after({ streams, events }).forEach(dispatch);
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
        effect.after(stream).forEach(dispatch);
        break;
      }
      case "photos/process photo": {
        const thumbnail = await makeThumbnail(effect.blob);
        const fullSize = await effect.blob.bytes();
        effect
          .after({
            streamName: effect.streamName,
            fullSize: {
              uuid: effect.fullSizeUUID,
              data: fullSize,
            },
            thumbnail: {
              uuid: effect.thumbnailUUID,
              data: thumbnail.data,
            },
          })
          .forEach(dispatch);
        break;
      }
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

function generateAuthToken(masterKey: MasterKeyPair) {
  return AuthToken.init({
    masterKey: masterKey,
    expiry: Temporal.Now.instant().add(AUTH_TOKEN_LIFETIME),
    permissions: new Set([
      "list streams",
      "create streams",
      "read stream data",
      "write stream data",
    ]),
  });
}
