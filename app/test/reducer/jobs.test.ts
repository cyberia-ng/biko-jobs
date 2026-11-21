import { describe, expect, test } from "vitest";
import type {
  AuthToken,
  Bytes,
  MasterKeyPair,
  MasterKeyPublic,
  Stream,
  StreamEvent,
} from "@biko-jobs/api-client";
import type { BlobUUID, State, StreamName } from "../../src/service-state/state.ts";
import { initialState as initialPersistentState } from "../../src/service-state/persistent/state.ts";
import type { Effect, Effector } from "../../src/service-state/effects.ts";
import { Store } from "../../src/service-state/store.ts";
import { enableMapSet } from "immer";
import type { Action } from "../../src/service-state/reducer.ts";
import type { StreamAction } from "../../src/service-state/persistent/action.ts";

enableMapSet();

type IMockEffector = { effector: Effector };
class MockEffector implements IMockEffector {
  streams: Map<StreamName, StreamEvent[]>;
  blobs: Map<BlobUUID, Bytes>;
  constructor() {
    this.streams = new Map();
    this.blobs = new Map();
  }

  async effector(effect: Effect, dispatch: (action: Action) => void) {
    await new Promise((res) => setTimeout(res, 0));
    switch (effect.type) {
      case "stream/create": {
        this.streams.set(effect.name, []);
        dispatch({
          type: "persistent/merge streams",
          streams: new Map(this.streams.keys().map((s) => [s, { name: s } as Stream] as const)),
        });
        break;
      }
      case "persistent/post stream event": {
        const stream = this.streams.get(effect.event.stream.name);
        if (stream === undefined) break;
        stream.push(effect.event);
        break;
      }
      case "blob/put blob": {
        if (!this.streams.has(effect.blob.stream.name)) break;
        this.blobs.set(effect.blob.uuid, effect.blob.data);
        break;
      }
    }
  }
}

const loggedInState: State = {
  loginState: {
    masterKeys: [
      { key: "fake master public key" as any as MasterKeyPublic, savedPassword: "some password" },
    ],
    login: {
      type: "master key",
      masterKey: "fake master key pair" as any as MasterKeyPair,
      cachedAuthToken: "fake auth token" as any as AuthToken,
    },
  },
  persistent: initialPersistentState,
  streams: new Map(),
  pendingStreamActions: [],
  outbox: [],
};

function outboxEmpty(store: Store): Promise<void> {
  return new Promise((res) => {
    const unsub = store.subscribe(() => {
      if (store.getSnapshot().outbox.length === 0) {
        res();
        unsub();
      }
    });
  });
}

function makeStore() {
  const mockEffector = new MockEffector();
  const store = new Store(
    mockEffector.effector.bind(mockEffector),
    () => Promise.reject(new Error("not implemented")),
    loggedInState,
  );
  return { store, mockEffector };
}

describe("job creation", () => {
  test("job creation works", async () => {
    const { store } = makeStore();
    store.dispatch({ type: "persistent/create stream", name: "some stream" });
    await outboxEmpty(store);
    expect(store.getSnapshot().streams.has("some stream")).toBe(true);
  });

  test("job creation and immediate data submission works", async () => {
    const { store, mockEffector } = makeStore();
    store.dispatch({ type: "persistent/create stream", name: "some job" });
    const upsertAction: StreamAction = {
      version: 3,
      type: "job action",
      timestamp: Temporal.Now.instant(),
      jobAction: {
        type: "upsert job",
        customerName: "some customer",
        customerPhoneNumber: "1",
        description: "some description",
        images: [],
      },
    };
    const actionUUID = crypto.randomUUID();
    store.dispatch({
      type: "persistent/dispatch stream action",
      streamName: "some job",
      actionUUID,
      action: upsertAction,
      associatedBlobs: new Map(),
    });
    await outboxEmpty(store);
    const job = store.getSnapshot().persistent.jobs.get("some job");
    expect(job).toBeDefined();
    expect(job!.customerName).toBe("some customer");
    const streamActions = mockEffector.streams.get("some job");
    expect(streamActions).toHaveLength(1);
    expect(streamActions![0]!.uuid).toBe(actionUUID);
    expect(streamActions![0]!.data).toStrictEqual(upsertAction);
  });
});

describe("job edit", () => {
  test("blob submission works", async () => {
    const { store, mockEffector } = makeStore();
    store.dispatch({ type: "persistent/create stream", name: "some job" });
    const blobUUID = crypto.randomUUID();
    const blobData = crypto.getRandomValues(new Uint8Array(16));
    store.dispatch({
      type: "persistent/dispatch stream action",
      streamName: "some job",
      actionUUID: crypto.randomUUID(),
      action: "fake action" as any as StreamAction,
      associatedBlobs: new Map([[blobUUID, blobData]]),
    });
    await outboxEmpty(store);
    expect(mockEffector.blobs.get(blobUUID)).toStrictEqual(blobData);
  });
});
