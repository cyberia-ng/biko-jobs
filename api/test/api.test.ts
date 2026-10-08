import "mocha";
import { createApp } from "@biko-jobs/api/app.ts";
import supertest from "supertest";
import { decode } from "@msgpack/msgpack";
import { expect } from "chai";

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
        expect(res.body).to.deep.equal(["some-id"]);
      });
    });

    test("with events in sessions", async () => {
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some-id/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"));
      await testApp.get("/session").expect((res) => {
        expect(res.body).to.deep.equal(["some-id"]);
      });
    });

    test("order is order of creation");

    test("spaces in url", async () => {
      const testApp = supertest(createApp());
      await testApp
        .post("/session/some id/events")
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("hello world", "utf8"));
      await testApp.get("/session").expect((res) => {
        expect(res.body).to.deep.equal(["some id"]);
      });
    });
  });
});
