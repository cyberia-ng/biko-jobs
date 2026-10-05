import { createApp } from "@biko-jobs/api/app.ts";
import "mocha";
import type { Server } from "node:http";
import { ApiClient } from "@biko-jobs/api-client";
import { expect } from "chai";

const test = it;

describe("api client", () => {
  let listener: Server;
  let port: number;

  beforeEach((done) => {
    const app = createApp();
    port = Math.round(Math.random() * (65535 - 1024) + 1024);
    listener = app.listen(port, done);
  });

  afterEach((done) => {
    listener.close(() => {
      done();
    });
    listener.closeAllConnections();
  });

  test("new session", async () => {
    const client = await ApiClient.open(`http://localhost:${port}`, "some-session", "a password");
    const events = await client.events();
    expect(events).to.deep.equal([]);
  });

  test("event round trip", async () => {
    const client = await ApiClient.open(`http://localhost:${port}`, "some-session", "a password");
    await client.postEvent({ hello: "world" });
    const events = await client.events();
    expect(events).to.deep.equal([{ hello: "world" }]);
  });

  test("blob round trip", async () => {
    const client = await ApiClient.open(`http://localhost:${port}`, "some-session", "a password");
    await client.putBlob("blob-id", Buffer.from("hello world", "utf8"));
    const received = await client.getBlob("blob-id");
    expect(received).to.deep.equal(Buffer.from("hello world", "utf8"));
  });

  test("non-existent blob", async () => {
    const client = await ApiClient.open(`http://localhost:${port}`, "some-session", "a password");
    const received = await client.getBlob("blob-id");
    expect(received).to.deep.equal(undefined);
  });

  test("clients with same parameters can read each other's data", async () => {
    const clientA = await ApiClient.open(`http://localhost:${port}`, "some session", "a password");
    const clientB = await ApiClient.open(`http://localhost:${port}`, "some session", "a password");
    await clientA.postEvent({ hello: "world" });
    const events = await clientB.events();
    expect(events).to.deep.equal([{ hello: "world" }]);
  });
});
