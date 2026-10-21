import express from "express";
import { createServer } from "node:http";
import { addRoutes } from "./routes.ts";
import { WrappedWebSocketServer } from "./websockets.ts";
import { Database } from "./database.ts";

export function createApp(sqlitePath?: string) {
  const app = express();
  const db = new Database(sqlitePath);
  const server = createServer(app);
  const wss = new WrappedWebSocketServer(server);
  addRoutes(app, db, wss.notifyClients.bind(wss));
  return server;
}
