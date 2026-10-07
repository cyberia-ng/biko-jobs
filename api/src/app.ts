import express from "express";
import { createServer } from "node:http";
import { Sessions } from "./sessions.ts";
import { addRoutes } from "./routes.ts";
import { WrappedWebSocketServer } from "./websockets.ts";

export function createApp() {
  const app = express();
  const sessions = new Sessions();
  const server = createServer(app);
  const wss = new WrappedWebSocketServer(server);
  addRoutes(app, sessions, wss.notifyClientsForSession.bind(wss));
  return server;
}
