import {
  ApiClient,
  ClientError,
  type JobEvent,
  MasterKeyPair,
  type Bytes,
  Job,
  NumberedJob,
  AuthToken,
  type JobBlob,
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
    blobDirectory = mkdtempSync(join(tmpdir(), "biko-jobs-test-"));
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
        "list jobs",
        "create jobs",
        "read job data",
        "write job data",
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
    test("adding new master key requires new encrypted job keys");
  });

  describe("jobs", () => {
    test("list jobs", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey.publicKey], authToken);
      const jobs = await client.listJobs(masterKey, authToken);
      expect(jobs).toStrictEqual([new NumberedJob(job.uuid, job.key, 1)]);
    });

    test("create fails for duplicate jobs", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey.publicKey], authToken);
      await expect(client.addJob(job, [masterKey.publicKey], authToken)).rejects.toThrow(
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
      await expect(client.addJob(job, [masterKey.publicKey], authToken)).rejects.toThrow(
        new ClientError({ type: "job keys incomplete" }),
      );
    });

    test("create returns numbered job", async () => {
      const localJob = await Job.generate(crypto.randomUUID());
      const numberedJob = await client.addJob(localJob, [masterKey.publicKey], authToken);
      expect(numberedJob).toEqual(localJob.withNumber(1));
    });
  });

  describe("job events", () => {
    test("add an event", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey.publicKey], authToken);
      const event: JobEvent = { uuid: crypto.randomUUID(), data: "hello world", job };
      await expect(client.addEvent(event, authToken)).resolves.not.toThrow();
    });

    test("duplicate UUID fails", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey.publicKey], authToken);
      const event = { uuid: crypto.randomUUID(), data: "hello world", job };
      await client.addEvent(event, authToken);
      await expect(client.addEvent(event, authToken)).rejects.toThrow(
        new ClientError({ type: "duplicate event", uuid: event.uuid }),
      );
    });

    test("get events for all jobs for which we know the key", async () => {
      const job1 = await Job.generate(crypto.randomUUID());
      const job2 = await Job.generate(crypto.randomUUID());
      await client.addJob(job1, [masterKey.publicKey], authToken);
      await client.addJob(job2, [masterKey.publicKey], authToken);
      const event1 = { uuid: crypto.randomUUID(), data: "hello world", job: job1 };
      const event2 = { uuid: crypto.randomUUID(), data: "hola mundo", job: job2 };
      await client.addEvent(event1, authToken);
      await client.addEvent(event2, authToken);
      const events = await client.getEventsByJobs([job1], authToken);
      expect(events.size).toBe(1);
      expect(events.get(job1.uuid)).toStrictEqual([event1]);
    });

    test("get events for empty job", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey.publicKey], authToken);
      const events = await client.getEventsByJobs([job], authToken);
      expect(events.size).toBe(1);
      expect(events.get(job.uuid)).toStrictEqual([]);
    });
  });

  describe("blobs", () => {
    test("put and read a blob", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey.publicKey], authToken);
      const blob: JobBlob = { uuid: crypto.randomUUID(), data: utf8("hello world"), job };
      await client.putBlob(blob, authToken);
      const received = await client.getBlob(blob.uuid, job, authToken);
      expect(received).toStrictEqual(blob);
    });

    test("duplicate UUID fails", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey.publicKey], authToken);
      const blob: JobBlob = { uuid: crypto.randomUUID(), data: utf8("hello world"), job };
      await client.putBlob(blob, authToken);
      await expect(client.putBlob(blob, authToken)).rejects.toThrow(
        new ClientError({ type: "blob put conflict", uuid: blob.uuid }),
      );
    });

    test("read non-existent blob", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey.publicKey], authToken);
      const received = await client.getBlob(crypto.randomUUID(), job, authToken);
      expect(received).toBe(undefined);
    });
  });

  describe("websocket events", () => {
    test("receives events", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey.publicKey], authToken);
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
      "list jobs": [
        async (badAuthToken: AuthToken) => {
          await client.listJobs(masterKey, badAuthToken);
        },
      ],
      "create jobs": [
        async (badAuthToken: AuthToken) => {
          const job = await Job.generate(crypto.randomUUID());
          await client.addJob(job, [masterKey.publicKey], badAuthToken);
        },
      ],
      "read job data": [
        async (badAuthToken: AuthToken) => {
          const job = await Job.generate(crypto.randomUUID());
          await client.addJob(job, [masterKey.publicKey], authToken);
          await client.getEventsByJobs([job], badAuthToken);
        },
        async (badAuthToken: AuthToken) => {
          const job = await Job.generate(crypto.randomUUID());
          const blob: JobBlob = { uuid: crypto.randomUUID(), job, data: utf8("hello world") };
          await client.putBlob(blob, authToken);
          await client.getBlob(blob.uuid, job, badAuthToken);
        },
      ],
      "write job data": [
        async (badAuthToken: AuthToken) => {
          const job = await Job.generate(crypto.randomUUID());
          await client.addJob(job, [masterKey.publicKey], authToken);
          const event: JobEvent = { uuid: crypto.randomUUID(), data: "hello world", job };
          await client.addEvent(event, badAuthToken);
        },
        async (badAuthToken: AuthToken) => {
          const job = await Job.generate(crypto.randomUUID());
          await client.addJob(job, [masterKey.publicKey], authToken);
          const blob: JobBlob = { uuid: crypto.randomUUID(), data: utf8("hello world"), job };
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
