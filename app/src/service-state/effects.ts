import {
  AuthToken,
  MasterKeyPair,
  MasterKeyPassword,
  MasterKeyPublic,
  type ApiClient,
  type StreamBlob,
  type StreamEvent,
} from "@biko-jobs/api-client";
import type { Action } from "./reducer.ts";
import { assertNever } from "../utilities/assert-never.ts";
import type { BlobUUID, StreamName } from "./state.ts";
import { makeThumbnail } from "../utilities/make-thumbnail.ts";

const AUTH_TOKEN_LIFETIME = Temporal.Duration.from({ minutes: 5 });

export type Effect =
  | { type: "login/fetch master public keys" }
  | { type: "login/load ephemeral auth token" }
  | { type: "login/persist ephemeral auth token"; authToken: AuthToken }
  | { type: "login/clear ephemeral auth token" }
  | { type: "login/perform password login"; masterKey: MasterKeyPublic; password: string }
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

export type Effector = (effect: Effect, dispatch: (action: Action) => void) => Promise<void>;
export function makeEffector(client: ApiClient): Effector {
  return async (effect, dispatch) => {
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
        const authToken = await AuthToken.init({
          masterKey,
          expiry: Temporal.Now.instant().add(AUTH_TOKEN_LIFETIME),
          permissions: new Set([
            "list streams",
            "create streams",
            "read stream data",
            "write stream data",
          ]),
        });
        // TODO: refresh auth token
        dispatch({ type: "login/log in with key pair", masterKey, authToken });
        dispatch({ type: "persistent/fetch events by master key" });
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
}
