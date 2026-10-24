import {
  ApiClient,
  ClientError,
  type JobBlob,
  type JobEvent,
  MasterKeyPair,
  type Bytes,
  Job,
  NumberedJob,
  AuthToken,
} from "@biko-jobs/api-client";
import { createApp } from "@biko-jobs/api/app.ts";
import { expect, test, describe, beforeEach, afterEach } from "vitest";
import type { Server } from "node:http";

describe("api client", () => {
  let masterKey: MasterKeyPair;
  let authToken: AuthToken;
  let client: ApiClient;
  let listener: Server;
  let port: number;

  beforeEach(async () => {
    const app = await createApp();
    port = Math.round(Math.random() * (65535 - 1024) + 1024);
    listener = await new Promise((res) => {
      const server = app.listen(port, () => res(server));
    });
    client = new ApiClient(`http://localhost:${port}`);
    const mks = await client.listMasterKeys();
    const mkPublic = mks.find((mk) => mk.name === "some name")!;
    masterKey = await mkPublic.toKeyPair("some password");
    authToken = await AuthToken.init({
      masterKey,
      expiry: Temporal.Now.instant().add(Temporal.Duration.from({ hours: 1 })),
      permissions: new Set(["add master key", "write jobs"]),
    });
  });

  afterEach(async () => {
    await new Promise<void>((res) => listener.close(() => res()));
    listener.closeAllConnections();
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
      expect(await mk.encryptionPublicKey.export()).toEqual(
        await masterKey.encryptionPublicKey.export(),
      );
      const encrypted = await mk.encryptionPublicKey.encrypt({
        type: "plaintext",
        data: utf8("hello world"),
      });
      const decrypted = await masterKey.encryptionPrivateKey.decrypt(encrypted);
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
    test("adding new master key requires new encrypted job keys");
  });

  describe("jobs", () => {
    test("get jobs", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey], authToken);
      const jobs = await client.getJobs(masterKey);
      expect(jobs).toStrictEqual([new NumberedJob(job.uuid, job.key, 1)]);
    });

    test("create fails for duplicate jobs", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey], authToken);
      await expect(client.addJob(job, [masterKey], authToken)).rejects.toThrow(
        new ClientError({ type: "job put conflict", uuid: job.uuid }),
      );
    });

    test("create fails without encryption by all known master keys", async () => {
      const otherMasterKey = await MasterKeyPair.generate(
        crypto.randomUUID(),
        "some other name",
        "some password",
      );
      await client.addMasterKeyPair(otherMasterKey, authToken);
      const job = await Job.generate(crypto.randomUUID());
      await expect(client.addJob(job, [masterKey], authToken)).rejects.toThrow(
        new ClientError({ type: "job keys incomplete" }),
      );
    });

    test("create returns job number", async () => {
      const job = await Job.generate(crypto.randomUUID());
      const jobNumber = await client.addJob(job, [masterKey], authToken);
      expect(jobNumber).toBe(1);
    });
  });

  describe("job events", () => {
    test("add an event", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey], authToken);
      const event: JobEvent = { uuid: crypto.randomUUID(), data: "hello world", job };
      await expect(client.addEvent(event, authToken)).resolves.not.toThrow();
    });

    test("duplicate UUID fails", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey], authToken);
      const event = { uuid: crypto.randomUUID(), data: "hello world", job };
      await client.addEvent(event, authToken);
      await expect(client.addEvent(event, authToken)).rejects.toThrow(
        new ClientError({ type: "duplicate event", uuid: event.uuid }),
      );
    });

    test("get events for all jobs for which we know the key", async () => {
      const job1 = await Job.generate(crypto.randomUUID());
      const job2 = await Job.generate(crypto.randomUUID());
      await client.addJob(job1, [masterKey], authToken);
      await client.addJob(job2, [masterKey], authToken);
      const event1 = { uuid: crypto.randomUUID(), data: "hello world", job: job1 };
      const event2 = { uuid: crypto.randomUUID(), data: "hola mundo", job: job2 };
      await client.addEvent(event1, authToken);
      await client.addEvent(event2, authToken);
      const events = await client.getEventsByJobs([job1]);
      expect(events.size).toBe(1);
      expect(events.get(job1.uuid)).toStrictEqual([event1]);
    });
  });

  describe("blobs", () => {
    test("put and read a blob", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey], authToken);
      const blob: JobBlob = { uuid: crypto.randomUUID(), data: utf8("hello world"), job };
      await client.putBlob(blob, authToken);
      const received = await client.getBlob(blob.uuid, job);
      expect(received).toStrictEqual(blob);
    });

    test("duplicate UUID fails", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey], authToken);
      const blob: JobBlob = { uuid: crypto.randomUUID(), data: utf8("hello world"), job };
      await client.putBlob(blob, authToken);
      await expect(client.putBlob(blob, authToken)).rejects.toThrow(
        new ClientError({ type: "blob put conflict", uuid: blob.uuid }),
      );
    });

    test("read non-existent blob", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey], authToken);
      const received = await client.getBlob(crypto.randomUUID(), job);
      expect(received).toBe(undefined);
    });
  });

  describe("websocket events", () => {
    test("receives events", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey], authToken);
      const event1: JobEvent = { uuid: crypto.randomUUID(), data: "hello world", job };
      const event2: JobEvent = { uuid: crypto.randomUUID(), data: "hola mundo", job };
      const expectedEvents = [event1, event2];
      let collectedEvents: JobEvent[] = [];
      let error: unknown = undefined;
      let doneCollectingEvents: () => void;
      const eventCollectionP = new Promise<void>((res) => {
        doneCollectingEvents = res;
      });
      let unsubscribe: (() => void) | undefined = undefined;
      try {
        await new Promise<void>((res) => {
          unsubscribe = client.subscribeEvents({
            getJob: () => job,
            getMasterKey: () => masterKey,
            onEvent: (event) => {
              if (event.type !== "job event") return;
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
    describe("write jobs", () => {
      const jobTestMethods = {
        addJob: async (badAuthToken: AuthToken) => {
          const job = await Job.generate(crypto.randomUUID());
          await client.addJob(job, [masterKey], badAuthToken);
        },
        addJobEvent: async (badAuthToken: AuthToken) => {
          const job = await Job.generate(crypto.randomUUID());
          await client.addJob(job, [masterKey], authToken);
          const event: JobEvent = { uuid: crypto.randomUUID(), data: "hello world", job };
          await client.addEvent(event, badAuthToken);
        },
        putBlob: async (badAuthToken: AuthToken) => {
          const job = await Job.generate(crypto.randomUUID());
          await client.addJob(job, [masterKey], authToken);
          const blob: JobBlob = { uuid: crypto.randomUUID(), data: utf8("hello world"), job };
          await client.putBlob(blob, badAuthToken);
        },
      };

      test("rejects bogus auth token", async () => {
        const unregisteredMasterKey = await MasterKeyPair.generate(
          crypto.randomUUID(),
          "unregistered",
          "password",
        );
        const bogusAuthToken = await AuthToken.init({
          masterKey: unregisteredMasterKey,
          expiry: Temporal.Now.instant().add(Temporal.Duration.from({ hours: 1 })),
          permissions: new Set(["write jobs"]),
        });
        for (const method of Object.values(jobTestMethods)) {
          await expect(method(bogusAuthToken)).rejects.toThrow(
            new ClientError({ type: "not authorized" }),
          );
        }
      });

      test("rejects expired auth token", async () => {
        const expiredAuthToken = await AuthToken.init({
          masterKey,
          expiry: Temporal.Now.instant().subtract(Temporal.Duration.from({ minutes: 1 })),
          permissions: new Set(["write jobs"]),
        });
        for (const method of Object.values(jobTestMethods)) {
          await expect(method(expiredAuthToken)).rejects.toThrow(
            new ClientError({ type: "not authorized" }),
          );
        }
      });

      test("rejects token without valid permission", async () => {
        const badAuthToken = await AuthToken.init({
          masterKey,
          expiry: Temporal.Now.instant().add(Temporal.Duration.from({ hours: 1 })),
          permissions: new Set(["add master key"]),
        });
        for (const method of Object.values(jobTestMethods)) {
          await expect(method(badAuthToken)).rejects.toThrow(
            new ClientError({ type: "not authorized" }),
          );
        }
      });
    });

    test("rejects adding master key if permission not given", async () => {
      const newMasterKey = await MasterKeyPair.generate(
        crypto.randomUUID(),
        "some other name",
        "some password",
      );
      const badAuthToken = await AuthToken.init({
        masterKey,
        expiry: Temporal.Now.instant().add(Temporal.Duration.from({ hours: 1 })),
        permissions: new Set(["write jobs"]),
      });
      await expect(client.addMasterKeyPair(newMasterKey, badAuthToken)).rejects.toThrow(
        new ClientError({ type: "not authorized" }),
      );
    });
  });
});
