import {
  ApiClient,
  ClientError,
  type StreamEvent,
  MasterKeyPair,
  type Bytes,
  Stream,
  AuthToken,
  type StreamBlob,
} from "@biko-jobs/api-client";
import { createApp } from "@biko-jobs/api/app.ts";
import { expect, test, describe, beforeEach, afterEach, beforeAll } from "vitest";
import type { Server } from "node:http";
import * as schemas from "@biko-jobs/api-client/schemas.ts";
import { mpDecoder, mpEncoder } from "@biko-jobs/api-client/messagepack.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("api client", () => {
  let masterKey: MasterKeyPair;
  let authToken: AuthToken;
  let client: ApiClient;
  let listener: Server;
  let port: number;
  let blobDirectory: string;

  beforeAll(async () => {
    masterKey = await MasterKeyPair.generate(crypto.randomUUID(), "some name", "some password");
  });

  beforeEach(async () => {
    blobDirectory = mkdtempSync(join(tmpdir(), "biko-streams-test-"));
    const app = await createApp({ initialMasterKey: masterKey, blobDirectory });
    port = Math.round(Math.random() * (65535 - 1024) + 1024);
    listener = await new Promise((res) => {
      const server = app.listen(port, () => res(server));
    });
    client = new ApiClient(`http://localhost:${port}`);
    authToken = await AuthToken.init({
      masterKey,
      expiry: Temporal.Now.instant().add(Temporal.Duration.from({ hours: 1 })),
      permissions: new Set([
        "add master key",
        "list streams",
        "create streams",
        "read stream data",
        "write stream data",
      ]),
    });
  });

  afterEach(async () => {
    await new Promise<void>((res) => listener.close(() => res()));
    listener.closeAllConnections();
    rmSync(blobDirectory, { recursive: true });
  });

  function utf8(s: string): Bytes {
    return new Uint8Array(Buffer.from(s, "utf8"));
  }

  describe("master keys", () => {
    test("add master key", async () => {
      const key = await MasterKeyPair.generate(
        crypto.randomUUID(),
        "some other name",
        "some password",
      );
      await expect(client.addMasterKeyPair(key, authToken)).resolves.not.toThrow();
    });

    test("list master keys", async () => {
      const keys = await client.listMasterKeys();
      expect(keys).toHaveLength(1);
      const mk = keys[0]!;
      expect(mk.name).toBe("some name");
      expect(mk.passwordSalt).toStrictEqual(masterKey.publicKey.passwordSalt);
      expect(mk.passwordHardness).toStrictEqual(masterKey.publicKey.passwordHardness);
      expect(await mk.encryptionPublicKey.export()).toEqual(
        await masterKey.publicKey.encryptionPublicKey.export(),
      );
      const encrypted = await mk.encryptionPublicKey.encrypt(
        {
          type: "plaintext",
          data: utf8("hello world"),
        },
        "some context",
      );
      const decrypted = await masterKey.encryptionKeyPrivate.decrypt(encrypted, "some context");
      expect(decrypted.data).toStrictEqual(utf8("hello world"));
    });

    test("get master key", async () => {
      const mk = await client.getMasterKeyPair(masterKey.password);
      expect(await mk.publicKey.encryptionPublicKey.export()).toEqual(
        await masterKey.publicKey.encryptionPublicKey.export(),
      );
      const encrypted = await mk.publicKey.encryptionPublicKey.encrypt(
        {
          type: "plaintext",
          data: utf8("hello world"),
        },
        "some context",
      );
      const decrypted = await masterKey.encryptionKeyPrivate.decrypt(encrypted, "some context");
      expect(decrypted.data).toStrictEqual(utf8("hello world"));
    });

    test("add fails for duplicate name", async () => {
      const key1 = await MasterKeyPair.generate(
        crypto.randomUUID(),
        "duplicate name",
        "some password",
      );
      const key2 = await MasterKeyPair.generate(
        crypto.randomUUID(),
        "duplicate name",
        "some other password",
      );
      await client.addMasterKeyPair(key1, authToken);
      await expect(client.addMasterKeyPair(key2, authToken)).rejects.toThrow(
        new ClientError({ type: "master key post conflict", name: key2.name, uuid: key2.uuid }),
      );
    });

    test("adding fails for duplicate uuid", async () => {
      const key = await MasterKeyPair.generate(
        crypto.randomUUID(),
        "duplicate name",
        "some password",
      );
      await client.addMasterKeyPair(key, authToken);
      await expect(client.addMasterKeyPair(key, authToken)).rejects.toThrow(
        new ClientError({ type: "master key post conflict", name: key.name, uuid: key.uuid }),
      );
    });

    // oxlint-disable-next-line jest/expect-expect jest/no-disabled-tests
    test("adding new master key requires new encrypted stream keys");
  });

  describe("streams", () => {
    test("create and list streams", async () => {
      const stream1 = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
        authToken,
      );
      const stream2 = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey], name: "some name" },
        authToken,
      );
      const streams = await client.listStreams(masterKey, authToken);
      expect(streams).toStrictEqual([
        new Stream(stream1.uuid, stream1.key, 1, undefined),
        new Stream(stream2.uuid, stream2.key, 2, "some name"),
      ]);
    });

    test("create fails for duplicate stream uuids", async () => {
      const stream = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
        authToken,
      );
      await expect(
        client.addStream({ uuid: stream.uuid, access: [masterKey.publicKey] }, authToken),
      ).rejects.toThrow(new ClientError({ type: "stream create conflict", uuid: stream.uuid }));
    });

    test("create fails for duplicate stream names", async () => {
      await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey], name: "some name" },
        authToken,
      );
      const secondUUID = crypto.randomUUID();
      await expect(
        client.addStream(
          { uuid: secondUUID, access: [masterKey.publicKey], name: "some name" },
          authToken,
        ),
      ).rejects.toThrow(new ClientError({ type: "stream create conflict", uuid: secondUUID }));
    });

    test("create fails without encryption by all known master keys", async () => {
      const otherMasterKey = await MasterKeyPair.generate(
        crypto.randomUUID(),
        "some other name",
        "some password",
      );
      await client.addMasterKeyPair(otherMasterKey, authToken);
      await expect(
        client.addStream({ uuid: crypto.randomUUID(), access: [masterKey.publicKey] }, authToken),
      ).rejects.toThrow(new ClientError({ type: "stream keys incomplete" }));
    });
  });

  describe("stream events", () => {
    test("add an event", async () => {
      const stream = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
        authToken,
      );
      const event: StreamEvent = { uuid: crypto.randomUUID(), data: "hello world", stream };
      await expect(client.addEvent(event, authToken)).resolves.not.toThrow();
    });

    test("duplicate UUID fails", async () => {
      const stream = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
        authToken,
      );
      const event = { uuid: crypto.randomUUID(), data: "hello world", stream };
      await client.addEvent(event, authToken);
      await expect(client.addEvent(event, authToken)).rejects.toThrow(
        new ClientError({ type: "duplicate event", uuid: event.uuid }),
      );
    });

    test("get events for all streams for which we know the key", async () => {
      const stream1 = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
        authToken,
      );
      const stream2 = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
        authToken,
      );
      const event1 = { uuid: crypto.randomUUID(), data: "hello world", stream: stream1 };
      const event2 = { uuid: crypto.randomUUID(), data: "hola mundo", stream: stream2 };
      await client.addEvent(event1, authToken);
      await client.addEvent(event2, authToken);
      const events = await client.getEventsByStreams([stream1], authToken);
      expect(events.size).toBe(1);
      expect(events.get(stream1.uuid)).toStrictEqual([event1]);
    });

    test("get events for empty stream", async () => {
      const stream = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
        authToken,
      );
      const events = await client.getEventsByStreams([stream], authToken);
      expect(events.size).toBe(1);
      expect(events.get(stream.uuid)).toStrictEqual([]);
    });
  });

  describe("blobs", () => {
    test("put and read a blob", async () => {
      const stream = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
        authToken,
      );
      const blob: StreamBlob = { uuid: crypto.randomUUID(), data: utf8("hello world"), stream };
      await client.putBlob(blob, authToken);
      const received = await client.getBlob(blob.uuid, stream, authToken);
      expect(received).toStrictEqual(blob);
    });

    test("duplicate UUID fails", async () => {
      const stream = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
        authToken,
      );
      const blob: StreamBlob = { uuid: crypto.randomUUID(), data: utf8("hello world"), stream };
      await client.putBlob(blob, authToken);
      await expect(client.putBlob(blob, authToken)).rejects.toThrow(
        new ClientError({ type: "blob create conflict", uuid: blob.uuid }),
      );
    });

    test("read non-existent blob", async () => {
      const stream = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
        authToken,
      );
      const received = await client.getBlob(crypto.randomUUID(), stream, authToken);
      expect(received).toBe(undefined);
    });
  });

  describe("websocket events", () => {
    test("receives events", async () => {
      const stream = await client.addStream(
        { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
        authToken,
      );
      const event1: StreamEvent = { uuid: crypto.randomUUID(), data: "hello world", stream };
      const event2: StreamEvent = { uuid: crypto.randomUUID(), data: "hola mundo", stream };
      const expectedEvents = [event1, event2];
      let collectedEvents: StreamEvent[] = [];
      let error: unknown = undefined;
      let doneCollectingEvents: () => void;
      const eventCollectionP = new Promise<void>((res) => {
        doneCollectingEvents = res;
      });
      let unsubscribe: (() => void) | undefined = undefined;
      try {
        await new Promise<void>((res) => {
          unsubscribe = client.subscribeEvents({
            getStream: () => stream,
            getMasterKey: () => masterKey,
            onEvent: (event) => {
              if (event.type !== "stream event") return;
              collectedEvents.push(event.event);
              if (collectedEvents.length === expectedEvents.length) {
                doneCollectingEvents();
              }
            },
            onConnect: () => res(),
            onError: (e) => {
              error = e;
              doneCollectingEvents();
            },
          });
        });
        await client.addEvent(event1, authToken);
        await client.addEvent(event2, authToken);
        await eventCollectionP;
        expect(error).toBe(undefined);
        expect(collectedEvents).toStrictEqual(expectedEvents);
      } finally {
        (unsubscribe as (() => void) | undefined)?.();
      }
    });
  });

  describe("authorization", () => {
    const testMethods: Record<schemas.Permission, Array<(t: AuthToken) => Promise<void>>> = {
      "add master key": [
        async (badAuthToken) => {
          const newMasterKey = await MasterKeyPair.generate(
            crypto.randomUUID(),
            "some other name",
            "some password",
          );
          await client.addMasterKeyPair(newMasterKey, badAuthToken);
        },
      ],
      "list streams": [
        async (badAuthToken: AuthToken) => {
          await client.listStreams(masterKey, badAuthToken);
        },
      ],
      "create streams": [
        async (badAuthToken: AuthToken) => {
          await client.addStream(
            { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
            badAuthToken,
          );
        },
      ],
      "read stream data": [
        async (badAuthToken: AuthToken) => {
          const stream = await client.addStream(
            { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
            authToken,
          );
          await client.getEventsByStreams([stream], badAuthToken);
        },
        async (badAuthToken: AuthToken) => {
          const stream = await client.addStream(
            { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
            authToken,
          );
          const blob: StreamBlob = { uuid: crypto.randomUUID(), stream, data: utf8("hello world") };
          await client.putBlob(blob, authToken);
          await client.getBlob(blob.uuid, stream, badAuthToken);
        },
      ],
      "write stream data": [
        async (badAuthToken: AuthToken) => {
          const stream = await client.addStream(
            { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
            authToken,
          );
          const event: StreamEvent = { uuid: crypto.randomUUID(), data: "hello world", stream };
          await client.addEvent(event, badAuthToken);
        },
        async (badAuthToken: AuthToken) => {
          const stream = await client.addStream(
            { uuid: crypto.randomUUID(), access: [masterKey.publicKey] },
            authToken,
          );
          const blob: StreamBlob = { uuid: crypto.randomUUID(), data: utf8("hello world"), stream };
          await client.putBlob(blob, badAuthToken);
        },
      ],
    };

    test("rejects bogus auth token", async () => {
      const unregisteredMasterKey = await MasterKeyPair.generate(
        crypto.randomUUID(),
        "unregistered",
        "password",
      );
      for (const [permission, tests] of Object.entries(testMethods)) {
        const bogusAuthToken = await AuthToken.init({
          masterKey: unregisteredMasterKey,
          expiry: Temporal.Now.instant().add(Temporal.Duration.from({ hours: 1 })),
          permissions: new Set([permission as schemas.Permission]),
        });
        for (const testFn of tests) {
          await expect(testFn(bogusAuthToken)).rejects.toThrow(
            new ClientError({ type: "not authorized" }),
          );
        }
      }
    });

    test("rejects expired auth token", async () => {
      for (const [permission, tests] of Object.entries(testMethods)) {
        const expiredAuthToken = await AuthToken.init({
          masterKey,
          expiry: Temporal.Now.instant().subtract(Temporal.Duration.from({ minutes: 1 })),
          permissions: new Set([permission as schemas.Permission]),
        });
        for (const method of tests) {
          await expect(method(expiredAuthToken)).rejects.toThrow(
            new ClientError({ type: "not authorized" }),
          );
        }
      }
    });

    test("rejects token without valid permission", async () => {
      for (const [, tests] of Object.entries(testMethods)) {
        const badAuthToken = await AuthToken.init({
          masterKey,
          expiry: Temporal.Now.instant().add(Temporal.Duration.from({ hours: 1 })),
          permissions: new Set([]),
        });
        for (const method of tests) {
          await expect(method(badAuthToken)).rejects.toThrow(
            new ClientError({ type: "not authorized" }),
          );
        }
      }
    });

    test("rejects token where signature does not match data", async () => {
      for (const [permission, tests] of Object.entries(testMethods)) {
        const badAuthToken = await AuthToken.init({
          masterKey,
          expiry: Temporal.Now.instant().add(Temporal.Duration.from({ hours: 1 })),
          permissions: new Set(),
        });
        const tokenData = mpDecoder.decode(
          Uint8Array.fromBase64(badAuthToken.tokenStr),
        ) as schemas.AuthToken;
        tokenData.authorization.permissions = new Set([permission as schemas.Permission]);
        const tokenStr = mpEncoder.encode(tokenData).toBase64();
        badAuthToken.tokenStr = tokenStr;
        for (const method of tests) {
          await expect(method(badAuthToken)).rejects.toThrow(
            new ClientError({ type: "not authorized" }),
          );
        }
      }
    });
  });
});
