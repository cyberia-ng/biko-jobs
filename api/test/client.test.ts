import {
  ApiClient,
  ClientError,
  type JobBlob,
  type JobEvent,
  MasterKeyPair,
  type Bytes,
  Job,
} from "@biko-jobs/api-client";
import { createApp } from "@biko-jobs/api/app.ts";
import { expect, test, describe, beforeAll, beforeEach, afterEach } from "vitest";
import type { Server } from "node:http";

describe("api client", () => {
  let masterKey: MasterKeyPair;
  let client: ApiClient;
  let listener: Server;
  let port: number;

  beforeAll(async () => {
    masterKey = await MasterKeyPair.generate("some name", "some password");
  });

  beforeEach(async () => {
    const app = createApp();
    port = Math.round(Math.random() * (65535 - 1024) + 1024);
    listener = await new Promise((res) => {
      const server = app.listen(port, () => res(server));
    });
    client = new ApiClient(`http://localhost:${port}`);
    await client.addMasterKeyPair(masterKey);
  });

  afterEach(async () => {
    await client.closeEventsSocket();
    await new Promise<void>((res) => listener.close(() => res()));
    listener.closeAllConnections();
  });

  function utf8(s: string): Bytes {
    return new Uint8Array(Buffer.from(s, "utf8"));
  }

  describe("master keys", () => {
    test("add master key", async () => {
      const key = await MasterKeyPair.generate("some other name", "some password");
      await client.addMasterKeyPair(key);
    });

    test("list master keys", async () => {
      const keys = await client.listMasterKeys();
      expect(keys).toHaveLength(1);
      const mk = keys[0]!;
      expect(mk.publicKey.fingerprint).to.equal(masterKey.publicKey.fingerprint);
      const encrypted = await mk.publicKey.encrypt({
        type: "plaintext",
        data: utf8("hello world"),
      });
      const decrypted = await masterKey.privateKey.decrypt(encrypted);
      expect(decrypted.data).to.deep.equal(utf8("hello world"));
    });

    test("add fails for duplicate name", async () => {
      const key1 = await MasterKeyPair.generate("duplicate name", "some password");
      const key2 = await MasterKeyPair.generate("duplicate name", "some other password");
      await client.addMasterKeyPair(key1);
      await expect(client.addMasterKeyPair(key2)).rejects.toThrow(
        new ClientError({ type: "master key post conflict", name: key2.name, uuid: key2.uuid }),
      );
    });

    test("adding fails for duplicate uuid", async () => {
      const key = await MasterKeyPair.generate("duplicate name", "some password");
      await client.addMasterKeyPair(key);
      await expect(client.addMasterKeyPair(key)).rejects.toThrow(
        new ClientError({ type: "master key post conflict", name: key.name, uuid: key.uuid }),
      );
    });

    test("adding new master key requires new encrypted job keys");
  });

  describe("jobs", () => {
    test("get jobs", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey]);
      const jobs = await client.getJobs(masterKey);
      expect(jobs).to.deep.equal([job]);
    });

    test("create fails for duplicate jobs", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey]);
      await expect(client.addJob(job, [masterKey])).rejects.toThrow(
        new ClientError({ type: "job put conflict", uuid: job.uuid }),
      );
    });

    test("create fails without encryption by all known master keys", async () => {
      const otherMasterKey = await MasterKeyPair.generate("some other name", "some password");
      await client.addMasterKeyPair(otherMasterKey);
      const job = await Job.generate(crypto.randomUUID());
      await expect(client.addJob(job, [masterKey])).rejects.toThrow(
        new ClientError({ type: "job keys incomplete" }),
      );
    });
  });

  describe("job events", () => {
    test("add an event", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey]);
      const event: JobEvent = { uuid: crypto.randomUUID(), data: "hello world", job };
      await client.addEvent(event);
    });

    test("duplicate UUID fails", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey]);
      const event = { uuid: crypto.randomUUID(), data: "hello world", job };
      await client.addEvent(event);
      await expect(client.addEvent(event)).rejects.toThrow(
        new ClientError({ type: "duplicate event", uuid: event.uuid }),
      );
    });

    test("get events for all jobs for which we know the key", async () => {
      const job1 = await Job.generate(crypto.randomUUID());
      const job2 = await Job.generate(crypto.randomUUID());
      await client.addJob(job1, [masterKey]);
      await client.addJob(job2, [masterKey]);
      const event1 = { uuid: crypto.randomUUID(), data: "hello world", job: job1 };
      const event2 = { uuid: crypto.randomUUID(), data: "hola mundo", job: job2 };
      await client.addEvent(event1);
      await client.addEvent(event2);
      const events = await client.getEventsByJobs([job1]);
      expect(events.size).to.equal(1);
      expect(events).to.have.key(job1.uuid);
      expect(events.get(job1.uuid)).to.deep.equal([event1]);
    });
  });

  describe("blobs", () => {
    test("put and read a blob", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey]);
      const blob: JobBlob = { uuid: crypto.randomUUID(), data: utf8("hello world"), job };
      await client.putBlob(blob);
      const received = await client.getBlob(blob.uuid, job);
      expect(received).to.deep.equal(blob);
    });

    test("duplicate UUID fails", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey]);
      const blob: JobBlob = { uuid: crypto.randomUUID(), data: utf8("hello world"), job };
      await client.putBlob(blob);
      await expect(client.putBlob(blob)).rejects.toThrow(
        new ClientError({ type: "blob put conflict", uuid: blob.uuid }),
      );
    });

    test("read non-existent blob", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey]);
      const received = await client.getBlob(crypto.randomUUID(), job);
      expect(received).to.equal(undefined);
    });
  });

  describe("websocket events", () => {
    test("receives events", async () => {
      const job = await Job.generate(crypto.randomUUID());
      await client.addJob(job, [masterKey]);
      const event1: JobEvent = { uuid: crypto.randomUUID(), data: "hello world", job };
      const event2: JobEvent = { uuid: crypto.randomUUID(), data: "hola mundo", job };
      const expectedEvents = [event1, event2];
      let collectedEvents: JobEvent[] = [];
      let error: unknown = undefined;
      let doneCollectingEvents: () => void;
      const eventCollectionP = new Promise<void>((res) => {
        doneCollectingEvents = res;
      });
      await new Promise<void>((res) =>
        client.subscribeEvents({
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
        }),
      );
      await client.addEvent(event1);
      await client.addEvent(event2);
      await eventCollectionP;
      expect(error).to.equal(undefined);
      expect(collectedEvents).to.deep.equal(expectedEvents);
    });
  });
});
