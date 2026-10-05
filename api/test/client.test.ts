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
    const client = await ApiClient.newSession(
      `http://localhost:${port}`,
      "some-session",
      "a password",
    );
    const events = await client.events();
    expect(events).to.deep.equal([]);
  });

  test("data round trip", async () => {
    const client = await ApiClient.newSession(
      `http://localhost:${port}`,
      "some-session",
      "a password",
    );
    await client.postEvent({ hello: "world" });
    const events = await client.events();
    expect(events).to.deep.equal([{ hello: "world" }]);
  });
});
