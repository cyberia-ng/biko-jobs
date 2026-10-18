import "temporal-polyfill/global";
import { createApp } from "@biko-jobs/api/app.ts";
import "mocha";
import type { Server } from "node:http";
import {
  ApiClient,
  ClientError,
  listSessions,
  type ClientErrorInfo,
  type ClientEvent,
} from "@biko-jobs/api-client";
import { expect } from "chai";
import { mpEncoder, mpDecoder } from "@biko-jobs/api-client/messagepack.ts";
import {
  SessionSharingChannel,
  SessionSharingReceiver,
  type SessionSharingError,
} from "@biko-jobs/api-client/session-sharing.ts";

const test = it;

function event(data: unknown = "hello world"): ClientEvent {
  return { uuid: crypto.randomUUID(), data };
}

describe("api client", () => {
  let client: ApiClient;
  let listener: Server;
  let port: number;

  beforeEach((done) => {
    const app = createApp();
    port = Math.round(Math.random() * (65535 - 1024) + 1024);
    listener = app.listen(port, () => {
      ApiClient.open(`http://localhost:${port}`, "some session", "a password").then((theClient) => {
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
    const event1 = event("hello world");
    const event2 = event("hola mundo");
    await client.postEvent(event1);
    await client.postEvent(event2);
    const events = await client.events();
    expect(events).to.deep.equal([event1, event2]);
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
      const event1 = event();
      await clientA.postEvent(event1);
      const events = await clientB.events();
      expect(events).to.deep.equal([event1]);
    } finally {
      clientA?.closeWebSocket();
      clientB?.closeWebSocket();
    }
  });

  test("websocket subscribe", (done) => {
    const event1 = event();
    const event2 = event("hola mundo");
    const expectedEvents = [event1, event2];
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
    client.postEvent(event1).then(() => {
      client.postEvent(event2);
    });
  });

  test("list sessions", async () => {
    await client.putBlob("some-id", Buffer.from("hello world", "utf8"));
    const clientB = await ApiClient.open(
      `http://localhost:${port}`,
      "some other session",
      "a password",
    );
    await clientB.postEvent(event());
    clientB.closeWebSocket();
    const receivedSessions = await listSessions(`http://localhost:${port}`);
    expect(receivedSessions).to.deep.equal([
      { session: "some session", finalized: false },
      { session: "some other session", finalized: false },
    ]);
  });

  describe("session finalization", () => {
    function expectClientError(p: Promise<unknown>, type: ClientErrorInfo["type"]) {
      return p
        .then(() => {
          throw new Error("expected promise rejection");
        })
        .catch((e) => {
          if (!(e instanceof ClientError && e.info.type === type)) {
            throw e;
          }
        });
    }

    test("succeeds when event uuids match", async () => {
      const event1 = event();
      await client.postEvent(event1);
      await client.finalize([event1.uuid], [], []);
    });

    test("makes session read-only", async () => {
      await client.finalize([], [], []);
      await expectClientError(client.postEvent(event()), "session finalized");
      await expectClientError(client.putBlob("some blob", new Uint8Array()), "session finalized");
      await expectClientError(client.finalize([], [], []), "session finalized");
    });

    test("events mismatch", async () => {
      await expectClientError(
        client.finalize([crypto.randomUUID()], [], []),
        "session finalization events mismatch",
      );
    });

    test("keeps salt blob", async () => {
      await client.finalize([], [], []);
      const res = await fetch(`http://localhost:${port}/session/some session/blob/salt`);
      expect(res.ok).to.equal(true);
    });
  });
});

describe("key exchange", () => {
  let listener: Server;
  let port: number;
  let sessionSharingChannel: SessionSharingChannel | undefined = undefined;
  let sessionSharingReceiver: SessionSharingReceiver | undefined = undefined;

  beforeEach((done) => {
    const app = createApp();
    port = Math.round(Math.random() * (65535 - 1024) + 1024);
    listener = app.listen(port, () => done());
  });

  afterEach((done) => {
    sessionSharingChannel?.close();
    sessionSharingReceiver?.close();
    listener.close(() => {
      done();
    });
    listener.closeAllConnections();
  });

  it("works", async () => {
    const confirm = async (receivedClientPubKey: Uint8Array) =>
      sessionSharingReceiver !== undefined &&
      Buffer.compare(sessionSharingReceiver.publicKey, receivedClientPubKey) === 0;
    let exchangedClientPubKey: Uint8Array | undefined = undefined;
    let sharingError: SessionSharingError | undefined = undefined;
    sessionSharingChannel = await SessionSharingChannel.open({
      baseUrl: `http://localhost:${port}`,
      session: "some-session",
      password: "some-password",
      approve: confirm,
      onKeyExchange: (clientPubKey) => {
        exchangedClientPubKey = clientPubKey;
      },
      onError: (error) => {
        sharingError = error;
      },
    });

    let receivingError: Event | undefined = undefined;
    sessionSharingReceiver = await SessionSharingReceiver.open({
      baseUrl: `http://localhost:${port}`,
      session: "some-session",
      serverPublicKey: sessionSharingChannel.publicKey,
      onWebSocketError: (event) => {
        receivingError = event;
      },
    });
    const receiveResult = await sessionSharingReceiver.receivePassword();
    expect(sharingError).to.equal(undefined);
    expect(receivingError).to.equal(undefined);
    expect(exchangedClientPubKey).to.deep.equal(sessionSharingReceiver.publicKey);
    expect(receiveResult.type).to.not.equal("rejected");
    expect(
      (receiveResult as Extract<typeof receiveResult, { type: "accepted" }>).password,
    ).to.deep.equal("some-password");
  });

  it("handles rejection", async () => {
    sessionSharingChannel = await SessionSharingChannel.open({
      baseUrl: `http://localhost:${port}`,
      session: "some-session",
      password: "some-password",
      approve: () => Promise.resolve(false),
      onKeyExchange: () => {},
      onError: () => {},
    });
    sessionSharingReceiver = await SessionSharingReceiver.open({
      baseUrl: `http://localhost:${port}`,
      session: "some-session",
      serverPublicKey: sessionSharingChannel.publicKey,
      onWebSocketError: () => {},
    });
    const receiveResult = await sessionSharingReceiver.receivePassword();
    expect(receiveResult.type).to.equal("rejected");
  });
});

describe("messagepack codec", () => {
  describe("temporal handling", () => {
    test("date before 1970", () => {
      const instant = Temporal.Instant.from("1969-07-20T20:17:40Z");
      expect(
        Temporal.Instant.compare(
          instant,
          mpDecoder.decode(mpEncoder.encode(instant)) as Temporal.Instant,
        ),
      ).to.equal(0);
    });

    test("date after 1970", () => {
      const instant = Temporal.Instant.from("2000-01-01T00:00:00Z");
      expect(
        Temporal.Instant.compare(
          instant,
          mpDecoder.decode(mpEncoder.encode(instant)) as Temporal.Instant,
        ),
      ).to.equal(0);
    });

    test("epoch -1 nanosecond", () => {
      const instant = Temporal.Instant.fromEpochNanoseconds(-1n);
      expect(
        Temporal.Instant.compare(
          instant,
          mpDecoder.decode(mpEncoder.encode(instant)) as Temporal.Instant,
        ),
      ).to.equal(0);
    });

    test("epoch +1 nanosecond", () => {
      const instant = Temporal.Instant.fromEpochNanoseconds(1n);
      expect(
        Temporal.Instant.compare(
          instant,
          mpDecoder.decode(mpEncoder.encode(instant)) as Temporal.Instant,
        ),
      ).to.equal(0);
    });
  });
});
