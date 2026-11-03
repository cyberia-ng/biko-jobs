import express from "express";
import { createServer } from "node:http";
import { addRoutes } from "./routes.ts";
import { WrappedWebSocketServer } from "./websockets.ts";
import { Database } from "./database.ts";
import type { MasterKeyPair } from "@biko-jobs/api-client";
import { DirectoryBlobStore, MemoryBlobStore } from "@biko-jobs/api/blob-store.ts";

export async function createApp(
  opts: {
    sqlitePath?: string | undefined;
    initialMasterKey?: MasterKeyPair | undefined;
    blobDirectory?: string | undefined;
  } = {},
) {
  const app = express();
  const db = new Database(opts.sqlitePath);
  const blobStore =
    opts.blobDirectory === undefined
      ? new MemoryBlobStore()
      : new DirectoryBlobStore(opts.blobDirectory);
  if (opts.initialMasterKey !== undefined) {
    db.addMasterKey(await opts.initialMasterKey.toWireFormat());
  }
  const server = createServer(app);
  const wss = new WrappedWebSocketServer(server);
  addRoutes(app, db, blobStore, wss.notifyClients.bind(wss));
  return server;
}
