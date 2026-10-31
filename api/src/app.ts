import express from "express";
import { createServer } from "node:http";
import { addRoutes } from "./routes.ts";
import { WrappedWebSocketServer } from "./websockets.ts";
import { Database } from "./database.ts";

export async function createApp(sqlitePath?: string) {
  const app = express();
  const db = new Database(sqlitePath);
  if (sqlitePath === undefined) {
    await db.registerInitialMasterKey("some name", "some password");
    if (process.env.NODE_ENV !== "test") {
      console.warn("WARNING: Server running with in-memory DB; dummy master key is registered.");
    }
  }
  const server = createServer(app);
  const wss = new WrappedWebSocketServer(server);
  addRoutes(app, db, wss.notifyClients.bind(wss));
  return server;
}
