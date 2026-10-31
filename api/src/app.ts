import express from "express";
import { createServer } from "node:http";
import { addRoutes } from "./routes.ts";
import { WrappedWebSocketServer } from "./websockets.ts";
import { Database } from "./database.ts";
import type { MasterKeyPair } from "@biko-jobs/api-client";

export async function createApp(
  opts: { sqlitePath?: string | undefined; initialMasterKey?: MasterKeyPair | undefined } = {},
) {
  const app = express();
  const db = new Database(opts.sqlitePath);
  if (opts.initialMasterKey !== undefined) {
    db.addMasterKey(await opts.initialMasterKey.toWireFormat());
  }
  const server = createServer(app);
  const wss = new WrappedWebSocketServer(server);
  addRoutes(app, db, wss.notifyClients.bind(wss));
  return server;
}
