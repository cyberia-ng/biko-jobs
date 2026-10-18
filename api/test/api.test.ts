import "temporal-polyfill/global";
import "mocha";
import { createApp } from "@biko-jobs/api/app.ts";
import supertest from "supertest";
import { decode } from "@msgpack/msgpack";
import { expect } from "chai";
import { mkdtempDisposableSync } from "node:fs";
import { Sessions } from "@biko-jobs/api/sessions.ts";
import { join } from "node:path";
import type { Server } from "node:http";
import { inspect } from "node:util";
import { mpEncoder } from "@biko-jobs/api-client/messagepack.ts";
import type TestAgent from "supertest/lib/agent.js";
import type { ApiEvent, FinalizationData } from "@biko-jobs/api-client/schemas.ts";

const test = it;

describe("api", () => {
  function event(data?: unknown) {
    const uuid = crypto.randomUUID();
    const event: ApiEvent = {
      uuid,
      data: mpEncoder.encode(data ?? "hello world"),
    };
    const encoded = Buffer.from(mpEncoder.encode(event));
    return { encoded, uuid, event };
  }

  test("health endpoint", async () => {
    await supertest(createApp()).get("/health").expect(200);
  });

  describe("session events read and update", () => {
    test("read empty session", async () => {
      const testApp = supertest(createApp());
      await testApp
        .get("/session/some-id/events")
        .expect(200)
        .expect("Content-Type", "application/vnd.msgpack")
        .responseType("blob")
        .expect((res) => {
          expect(decode(res.body)).to.deep.equal([]);
        });
    });

    test("append to session events", async () => {
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event().encoded)
        .expect(200);
    });

    test("empty event data", async () => {
      const testApp = supertest(createApp());
      await testApp.post("/session/some-id/events").expect(400);
    });

    test("non-msgpack event data", async () => {
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/json")
        .send({ hello: "world" })
        .expect(400);
    });

    test("events must have uuids", async () => {
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(Buffer.from(mpEncoder.encode({ data: new Uint8Array() })))
        .expect(400);
    });

    test("duplicate uuids are rejected", async () => {
      const event1 = event();
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event1.encoded);
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event1.encoded)
        .expect(409);
    });

    test("read updated session", async () => {
      const event1 = event();
      const event2 = event("hola mundo");
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event1.encoded);
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event2.encoded);
      await testApp
        .get("/session/some-id/events")
        .expect(200)
        .expect("Content-Type", "application/vnd.msgpack")
        .expect("ETag", new RegExp(""))
        .responseType("blob")
        .expect((res) => {
          expect(decode(res.body)).to.deep.equal([event1.event, event2.event]);
        });
    });

    test("spaces in url", async () => {
      const event1 = event();
      const event2 = event("hola mundo");
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some id/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event1.encoded);
      await testApp
        .post("/session/some id/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event2.encoded);
      await testApp
        .get("/session/some id/events")
        .expect(200)
        .expect("Content-Type", "application/vnd.msgpack")
        .responseType("blob")
        .expect((res) => {
          expect(decode(res.body)).to.deep.equal([event1.event, event2.event]);
        });
    });
  });

  describe("session blobs", () => {
    test("upload blob", async () => {
      const testApp = supertest(createApp());
      await testApp
        .put("/session/some-id/blob/some-blob-id")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"))
        .expect(201);
    });

    test("get blob", async () => {
      const testApp = supertest(createApp());
      await testApp
        .put("/session/some-id/blob/some-blob-id")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"));
      await testApp
        .get("/session/some-id/blob/some-blob-id")
        .expect(200)
        .expect("Content-Type", "application/octet-stream")
        .expect("ETag", new RegExp(""))
        .expect((res) => {
          expect(res.body).to.deep.equal(Buffer.from("hello world", "utf8"));
        });
    });

    test("spaces in url", async () => {
      const testApp = supertest(createApp());
      await testApp
        .put("/session/some id/blob/some blob id")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"));
      await testApp
        .get("/session/some id/blob/some blob id")
        .expect(200)
        .expect("Content-Type", "application/octet-stream")
        .expect((res) => {
          expect(res.body).to.deep.equal(Buffer.from("hello world", "utf8"));
        });
    });

    test("blobs are immutable", async () => {
      const testApp = supertest(createApp());
      await testApp
        .put("/session/some-id/blob/some-blob-id")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"));
      await testApp
        .put("/session/some-id/blob/some-blob-id")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"))
        .expect(409);
    });
  });

  describe("list sessions", () => {
    test("when no sessions", async () => {
      const testApp = supertest(createApp());
      await testApp
        .get("/session")
        .expect(200)
        .expect("Content-Type", /json/)
        .expect((res) => {
          expect(res.body).to.deep.equal([]);
        });
    });

    test("with only blobs", async () => {
      const testApp = supertest(createApp());
      await testApp
        .put("/session/some-id/blob/some-blob-id")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"));
      await testApp.get("/session").expect((res) => {
        expect(res.body).to.deep.equal([{ session: "some-id", finalized: false }]);
      });
    });

    test("with events in sessions", async () => {
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event().encoded);
      await testApp.get("/session").expect((res) => {
        expect(res.body).to.deep.equal([{ session: "some-id", finalized: false }]);
      });
    });

    test("spaces in url", async () => {
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some id/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event().encoded);
      await testApp.get("/session").expect((res) => {
        expect(res.body).to.deep.equal([{ session: "some id", finalized: false }]);
      });
    });
  });

  test("re-using a database works", () => {
    using tempDir = mkdtempDisposableSync("biko-jobs-db-test");
    new Sessions(join(tempDir.path, "test.db"));
    new Sessions(join(tempDir.path, "test.db"));
  });

  describe("websockets", () => {
    let listener: Server;
    let port: number;
    let sockets: Set<WebSocket>;

    beforeEach((done) => {
      const app = createApp();
      port = Math.round(Math.random() * (65535 - 1024) + 1024);
      listener = app.listen(port, () => done());
      sockets = new Set();
    });

    afterEach((done) => {
      for (const socket of sockets) {
        socket.close();
      }
      listener.close(() => {
        done();
      });
      listener.closeAllConnections();
    });

    describe("events websocket", () => {
      test("connects", (done) => {
        const socket = new WebSocket(`http://localhost:${port}/session/some-session/events`);
        sockets.add(socket);
        socket.addEventListener("open", () => done());
      });

      test("receives events", async () => {
        const socket = new WebSocket(`http://localhost:${port}/session/some-session/events`);
        sockets.add(socket);
        const event1 = event();
        const receivedP = new Promise((res, rej) => {
          socket.addEventListener("message", (msg) => {
            (msg.data as Blob)
              .bytes()
              .then((receivedData) => res(receivedData))
              .catch((e) => rej(e));
          });
        });
        await fetch(`http://localhost:${port}/session/some-session/events`, {
          method: "POST",
          body: event1.encoded,
          headers: { "Content-Type": "application/vnd.msgpack" },
        });
        const received = await receivedP;
        expect(received).to.deep.equal(event1.encoded);
      });
    });

    describe("websocket channels", () => {
      test("connects", (done) => {
        const socket = new WebSocket(`http://localhost:${port}/channel/some-channel`);
        sockets.add(socket);
        socket.addEventListener("error", (e) => done(new Error(inspect(e))));
        socket.addEventListener("open", () => done());
      });

      test("both ends can communicate", (done) => {
        const socketA = new WebSocket(`http://localhost:${port}/channel/some-channel`);
        sockets.add(socketA);
        const socketB = new WebSocket(`http://localhost:${port}/channel/some-channel`);
        sockets.add(socketB);
        socketA.addEventListener("error", (e) => done(new Error(inspect(e))));
        socketB.addEventListener("error", (e) => done(new Error(inspect(e))));
        const msg1 = Buffer.from("hello world", "utf8");
        const msg2 = Buffer.from("hola mundo", "utf8");

        Promise.all([
          new Promise<void>((res) => socketA.addEventListener("open", () => res())),
          new Promise<void>((res) => socketB.addEventListener("open", () => res())),
        ])
          .then(() => {
            const msgA = new Promise<Blob>((res) =>
              socketA.addEventListener("message", (msg) => res(msg.data)),
            ).then((d) => d.bytes());
            const msgB = new Promise<Blob>((res) =>
              socketB.addEventListener("message", (msg) => res(msg.data)),
            ).then((d) => d.bytes());
            socketA.send(msg1);
            socketB.send(msg2);
            return Promise.all([msgA, msgB]);
          })
          .then(([dataA, dataB]) => {
            expect(dataA).to.deep.equal(msg2);
            expect(dataB).to.deep.equal(msg1);
          })
          .then(() => done())
          .catch((e) => done(e));
      });
    });
  });

  describe("session finalization", () => {
    function finalize(app: TestAgent, session: string, data: FinalizationData) {
      return app
        .post(`/session/${session}/finalize`)
        .set("Content-Type", "application/vnd.msgpack")
        .send(Buffer.from(mpEncoder.encode(data)));
    }

    const emptyFinalizationData: FinalizationData = {
      knownEventUUIDs: [],
      events: [],
      blobsToKeep: [],
    };

    test("finalize new session", async () => {
      await finalize(supertest(createApp()), "some-session", emptyFinalizationData).expect(200);
    });

    test("finalize existing session", async () => {
      const app = supertest(createApp());
      await app.put("/session/some-session/blob").send(Buffer.from("hello world", "utf8"));
      await finalize(app, "some-session", emptyFinalizationData).expect(200);
    });

    test("finalized sessions cannot receive events (new session)", async () => {
      const app = supertest(createApp());
      await finalize(app, "some-session", emptyFinalizationData);
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event().encoded)
        .expect(405)
        .expect("Allow", "GET, HEAD");
    });

    test("finalized sessions cannot receive events (existing session)", async () => {
      const app = supertest(createApp());
      await app.put("/session/some-session/blob").send(Buffer.from("hello world", "utf8"));
      await finalize(app, "some-session", emptyFinalizationData);
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event().encoded)
        .expect(405)
        .expect("Allow", "GET, HEAD");
    });

    test("trying to finalize an already finalized session fails", async () => {
      const app = supertest(createApp());
      await finalize(app, "some-session", emptyFinalizationData);
      await finalize(app, "some-session", emptyFinalizationData).expect(409);
    });

    test("finalized sessions cannot receive blobs", async () => {
      const app = supertest(createApp());
      await finalize(app, "some-session", emptyFinalizationData);
      await app
        .put("/session/some-session/blob/some-blob")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"))
        .expect(405)
        .expect("Allow", "GET, HEAD");
    });

    test("finalized sessions appear in sessions list as finalized", async () => {
      const app = supertest(createApp());
      await finalize(app, "some-session", emptyFinalizationData);
      await app.get("/session").expect([{ session: "some-session", finalized: true }]);
    });

    test("finalized sessions contain events from finalization data", async () => {
      const app = supertest(createApp());
      const event1 = event();
      const event2 = event("hola mundo");
      await finalize(app, "some-session", {
        ...emptyFinalizationData,
        events: [event1.event, event2.event],
      });
      await app
        .get("/session/some-session/events")
        .responseType("blob")
        .expect((res) => {
          expect(decode(res.body)).to.deep.equal([event1.event, event2.event]);
        });
    });

    test("finalized sessions still contain blobs specified in finalization data", async () => {
      const app = supertest(createApp());
      const blob1 = new Uint8Array(Buffer.from("some blob data", "utf8"));
      const blob2 = new Uint8Array(Buffer.from("some more blob data", "utf8"));
      await app
        .put("/session/some-session/blob/blob-1")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from(blob1));
      await app
        .put("/session/some-session/blob/blob-2")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from(blob2));
      await finalize(app, "some-session", {
        ...emptyFinalizationData,
        blobsToKeep: ["blob1", "blob2"],
      });
      await app
        .get("/session/some-session/blob/blob-1")
        .responseType("blob")
        .expect(Buffer.from(blob1));
      await app
        .get("/session/some-session/blob/blob-2")
        .responseType("blob")
        .expect(Buffer.from(blob2));
    });

    test("finalized sessions do not contain pre-finalization events", async () => {
      const app = supertest(createApp());
      const event1 = event();
      const event2 = event("hola mundo");
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event1.encoded);
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event2.encoded);
      await finalize(app, "some-session", {
        ...emptyFinalizationData,
        knownEventUUIDs: [event1.uuid, event2.uuid],
      }).expect(200);
      await app
        .get("/session/some-session/events")
        .responseType("blob")
        .expect((res) => {
          expect(decode(res.body)).to.deep.equal([]);
        });
    });

    test("finalized sessions do not contain pre-finalization blobs", async () => {
      const app = supertest(createApp());
      await app
        .put("/session/some-session/blob/blob-1")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"));
      await app
        .put("/session/some-session/blob/blob-2")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hola mundo", "utf8"));
      await finalize(app, "some-session", emptyFinalizationData);
      await app.get("/session/some-session/blob/blob-1").expect(404);
      await app.get("/session/some-session/blob/blob-2").expect(404);
    });

    test("finalizing a session fails if hash of existing events does not match", async () => {
      const app = supertest(createApp());
      const event1 = event();
      const event2 = event("hola mundo");
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event1.encoded);
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/vnd.msgpack")
        .send(event2.encoded);
      await finalize(app, "some-session", {
        ...emptyFinalizationData,
        knownEventUUIDs: [crypto.randomUUID(), crypto.randomUUID()],
      }).expect(422);
    });

    describe("finalizing a session requires valid finalization data", () => {
      test("no data", async () => {
        const app = supertest(createApp());
        await app.post("/session/some-session/finalize").expect(400);
      });

      test("invalid data", async () => {
        const app = supertest(createApp());
        await app
          .post("/session/some-session/finalize")
          .set("Content-Type", "application/vnd.msgpack")
          .send(Buffer.from(mpEncoder.encode({})))
          .expect(400);
      });
    });
  });
});
