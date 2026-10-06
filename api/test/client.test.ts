import { createApp } from "@biko-jobs/api/app.ts";
import "mocha";
import type { Server } from "node:http";
import { ApiClient } from "@biko-jobs/api-client";
import { expect } from "chai";

const test = it;

describe("api client", () => {
  let client: ApiClient;
  let listener: Server;
  let port: number;

  beforeEach((done) => {
    const app = createApp();
    port = Math.round(Math.random() * (65535 - 1024) + 1024);
    listener = app.listen(port, () => {
      ApiClient.open(`http://localhost:${port}`, "some-session", "a password").then((theClient) => {
        client = theClient;
        done();
      });
    });
  });

  afterEach((done) => {
    listener.close(() => {
      done();
    });
    listener.closeAllConnections();
    client.closeWebSocket();
  });

  test("new session", async () => {
    const events = await client.events();
    expect(events).to.deep.equal([]);
  });

  test("event round trip", async () => {
    await client.postEvent({ hello: "world" });
    await client.postEvent({ hola: "mundo" });
    const events = await client.events();
    expect(events).to.deep.equal([{ hello: "world" }, { hola: "mundo" }]);
  });

  test("blob round trip", async () => {
    await client.putBlob("blob-id", Buffer.from("hello world", "utf8"));
    const received = await client.getBlob("blob-id");
    expect(received).to.deep.equal(Buffer.from("hello world", "utf8"));
  });

  test("non-existent blob", async () => {
    const received = await client.getBlob("blob-id");
    expect(received).to.deep.equal(undefined);
  });

  test("clients with same parameters can read each other's data", async () => {
    let clientA: ApiClient | undefined = undefined;
    let clientB: ApiClient | undefined = undefined;
    try {
      clientA = await ApiClient.open(`http://localhost:${port}`, "some session", "a password");
      clientB = await ApiClient.open(`http://localhost:${port}`, "some session", "a password");
      await clientA.postEvent({ hello: "world" });
      const events = await clientB.events();
      expect(events).to.deep.equal([{ hello: "world" }]);
    } finally {
      clientA?.closeWebSocket();
      clientB?.closeWebSocket();
    }
  });

  describe("websocket subscribe", () => {
    test("it works", (done) => {
      let expectedEvents = [{ hello: "world" }, { hola: "mundo" }];
      client.subscribeEvents((event) => {
        const expected = expectedEvents.shift();
        try {
          expect(event).to.deep.equal(expected);
        } catch (e) {
          done(e);
        }
        if (expectedEvents.length === 0) {
          done();
        }
      });
      client.postEvent({ hello: "world" }).then(() => {
        client.postEvent({ hola: "mundo" });
      });
    });
  });
});
