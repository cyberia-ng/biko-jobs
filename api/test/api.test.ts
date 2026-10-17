import "temporal-polyfill/global";
import "mocha";
import { createApp } from "@biko-jobs/api/app.ts";
import supertest from "supertest";
import { decode } from "@msgpack/msgpack";
import { expect } from "chai";
import { mkdtempDisposableSync } from "node:fs";
import { FinalizationData, Sessions } from "@biko-jobs/api/sessions.ts";
import { join } from "node:path";
import type { Server } from "node:http";
import { inspect } from "node:util";
import { mpEncoder } from "@biko-jobs/api-client/messagepack.ts";
import type TestAgent from "supertest/lib/agent.js";

const test = it;

describe("api", () => {
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
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"))
        .expect(200);
    });

    test("empty event", async () => {
      const testApp = supertest(createApp());
      await testApp.post("/session/some-id/events").expect(400);
    });

    test("attempt to append non-buffer", async () => {
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/json")
        .send({ hello: "world" })
        .expect(400);
    });

    test("read updated session", async () => {
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"));
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hola mundo", "utf8"));
      await testApp
        .get("/session/some-id/events")
        .expect(200)
        .expect("Content-Type", "application/vnd.msgpack")
        .expect("ETag", new RegExp(""))
        .responseType("blob")
        .expect((res) => {
          expect(decode(res.body)).to.deep.equal([
            Buffer.from("hello world", "utf8"),
            Buffer.from("hola mundo", "utf8"),
          ]);
        });
    });

    test("spaces in url", async () => {
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some id/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"));
      await testApp
        .post("/session/some id/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hola mundo", "utf8"));
      await testApp
        .get("/session/some id/events")
        .expect(200)
        .expect("Content-Type", "application/vnd.msgpack")
        .responseType("blob")
        .expect((res) => {
          expect(decode(res.body)).to.deep.equal([
            Buffer.from("hello world", "utf8"),
            Buffer.from("hola mundo", "utf8"),
          ]);
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
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"));
      await testApp.get("/session").expect((res) => {
        expect(res.body).to.deep.equal([{ session: "some-id", finalized: false }]);
      });
    });

    test("spaces in url", async () => {
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some id/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"));
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

      test("receives events", (done) => {
        const socket = new WebSocket(`http://localhost:${port}/session/some-session/events`);
        sockets.add(socket);
        const data = Buffer.from("hello world", "utf8");
        socket.addEventListener("message", (msg) => {
          (msg.data as Blob)
            .bytes()
            .then((receivedData) => expect(receivedData).to.deep.equal(data))
            .then(() => done())
            .catch((e) => done(e));
        });
        fetch(`http://localhost:${port}/session/some-session/events`, {
          method: "POST",
          body: data,
          headers: { "Content-Type": "application/octet-stream" },
        });
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

    async function hashEvents(events: Array<Uint8Array>) {
      return new Uint8Array(await crypto.subtle.digest("SHA-256", mpEncoder.encode(events)));
    }

    async function emptyFinalizationData(
      existingEventsHash?: Uint8Array<ArrayBuffer>,
    ): Promise<FinalizationData> {
      const hash: Uint8Array<ArrayBuffer> = existingEventsHash ?? (await hashEvents([]));
      return {
        existingEventsHash: hash,
        events: [],
        blobsToKeep: [],
      };
    }

    test("finalize new session", async () => {
      await finalize(supertest(createApp()), "some-session", await emptyFinalizationData()).expect(
        200,
      );
    });

    test("finalize existing session", async () => {
      const app = supertest(createApp());
      await app.put("/session/some-session/blob").send(Buffer.from("hello world", "utf8"));
      await finalize(app, "some-session", await emptyFinalizationData()).expect(200);
    });

    test("finalized sessions cannot receive events (new session)", async () => {
      const app = supertest(createApp());
      await finalize(app, "some-session", await emptyFinalizationData());
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"))
        .expect(405)
        .expect("Allow", "GET, HEAD");
    });

    test("finalized sessions cannot receive events (existing session)", async () => {
      const app = supertest(createApp());
      await app.put("/session/some-session/blob").send(Buffer.from("hello world", "utf8"));
      await finalize(app, "some-session", await emptyFinalizationData());
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"))
        .expect(405)
        .expect("Allow", "GET, HEAD");
    });

    test("trying to finalize an already finalized session fails", async () => {
      const app = supertest(createApp());
      await finalize(app, "some-session", await emptyFinalizationData());
      await finalize(app, "some-session", await emptyFinalizationData()).expect(409);
    });

    test("finalized sessions cannot receive blobs", async () => {
      const app = supertest(createApp());
      await finalize(app, "some-session", await emptyFinalizationData());
      await app
        .put("/session/some-session/blob/some-blob")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"))
        .expect(405)
        .expect("Allow", "GET, HEAD");
    });

    test("finalized sessions appear in sessions list as finalized", async () => {
      const app = supertest(createApp());
      await finalize(app, "some-session", await emptyFinalizationData());
      await app.get("/session").expect([{ session: "some-session", finalized: true }]);
    });

    test("finalized sessions contain events from finalization data", async () => {
      const app = supertest(createApp());
      const event1 = new Uint8Array(Buffer.from("hello world", "utf8"));
      const event2 = new Uint8Array(Buffer.from("hola mundo", "utf8"));
      await finalize(app, "some-session", {
        existingEventsHash: await hashEvents([]),
        events: [event1, event2],
        blobsToKeep: [],
      });
      await app
        .get("/session/some-session/events")
        .responseType("blob")
        .expect((res) => {
          expect(decode(res.body)).to.deep.equal([event1, event2]);
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
        existingEventsHash: await hashEvents([]),
        events: [],
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
      const event1 = new Uint8Array(Buffer.from("hello world", "utf8"));
      const event2 = new Uint8Array(Buffer.from("hola mundo", "utf8"));
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from(event1));
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from(event2));
      await finalize(
        app,
        "some-session",
        await emptyFinalizationData(await hashEvents([event1, event2])),
      );
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
      await finalize(app, "some-session", await emptyFinalizationData());
      await app.get("/session/some-session/blob/blob-1").expect(404);
      await app.get("/session/some-session/blob/blob-2").expect(404);
    });

    test("finalizing a session fails if hash of existing events does not match", async () => {
      const app = supertest(createApp());
      const event1 = new Uint8Array(Buffer.from("hello world", "utf8"));
      const event2 = new Uint8Array(Buffer.from("hola mundo", "utf8"));
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from(event1));
      await app
        .post("/session/some-session/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from(event2));
      await finalize(app, "some-session", await emptyFinalizationData()).expect(422);
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
