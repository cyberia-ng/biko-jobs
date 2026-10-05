import { Encoder } from "@msgpack/msgpack";
import express from "express";

export function createApp() {
  const app = express();

  const sessions = new Map<string, Uint8Array[]>();

  app.get("/health", (_, res) => {
    res.status(200);
    res.end();
  });

  app.put("/session/:sessionId", (req, res) => {
    if (sessions.has(req.params.sessionId)) {
      res.status(409);
    } else {
      sessions.set(req.params.sessionId, []);
      res.status(201);
    }
    res.end();
  });

  const encoder = new Encoder();
  app.get("/session/:sessionId", (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (session === undefined) {
      res.status(404);
      res.end();
    } else {
      const response = encoder.encode(session);
      res.status(200);
      res.header("Content-Type", "application/vnd.msgpack");
      res.end(response);
    }
  });

  app.post("/session/:sessionId", express.raw(), (req, res) => {
    if (req.body === undefined) {
      res.status(400);
      res.end();
      return;
    }
    if (!(req.body instanceof Buffer)) {
      throw new Error("unreachable: expected Buffer");
    }
    const session = sessions.get(req.params.sessionId);
    if (session === undefined) {
      res.status(500);
      res.end();
      throw new Error("not implemented");
    } else {
      session.push(req.body);
      res.status(200);
      res.end();
    }
  });

  return app;
}
