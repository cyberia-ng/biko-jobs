import "temporal-polyfill/global";
import { createApp } from "@biko-jobs/api/app.ts";
import type { Server } from "node:http";
import { ClientChannel, ServerChannel } from "@biko-jobs/api-client/pairing.ts";
import { ApiClient, AuthToken, MasterKeyPair } from "@biko-jobs/api-client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

describe("pairing", () => {
  let listener: Server;
  let port: number;
  let serverChannel: ServerChannel;
  let clientChannel: ClientChannel;
  let masterKey: MasterKeyPair;
  let authToken: AuthToken;
  let client: ApiClient;

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
    serverChannel.close();
    clientChannel.close();
    await new Promise<void>((res) => listener.close(() => res()));
    listener.closeAllConnections();
  });

  test("it works", async () => {
    const approve = async (receivedClientFingerprint: string) => {
      if (clientChannel.fingerprint === receivedClientFingerprint) {
        return authToken;
      } else {
        return "rejected" as const;
      }
    };
    let sharingError: Event | undefined = undefined;
    serverChannel = await ServerChannel.open({
      baseUrl: `http://localhost:${port}`,
      requestId: "some request",
      approve,
      onWebSocketError: (event) => {
        sharingError = event;
      },
    });

    let receivingError: Event | undefined = undefined;
    clientChannel = await ClientChannel.open({
      baseUrl: `http://localhost:${port}`,
      requestId: "some request",
      onWebSocketError: (event) => {
        receivingError = event;
      },
    });
    const [, receiveResult] = await Promise.all([serverChannel.pair(), clientChannel.pair()]);
    expect(sharingError).toBe(undefined);
    expect(receivingError).toBe(undefined);
    expect(receiveResult.type).not.toStrictEqual("rejected");
    expect(
      (receiveResult as Extract<typeof receiveResult, { type: "accepted" }>).authToken,
    ).toStrictEqual(authToken);
  });

  test("it handles rejection", async () => {
    serverChannel = await ServerChannel.open({
      baseUrl: `http://localhost:${port}`,
      requestId: "some request",
      approve: () => Promise.resolve("rejected"),
      onWebSocketError: () => {},
    });
    clientChannel = await ClientChannel.open({
      baseUrl: `http://localhost:${port}`,
      requestId: "some request",
      onWebSocketError: () => {},
    });
    const [, receiveResult] = await Promise.all([serverChannel.pair(), clientChannel.pair()]);
    expect(receiveResult.type).toBe("rejected");
  });
});
