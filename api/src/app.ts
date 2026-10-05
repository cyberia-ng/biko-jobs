import { Encoder } from "@msgpack/msgpack";
import express from "express";

type Session = {
  events: Uint8Array[];
  blobs: Map<string, Uint8Array>;
};

export function createApp() {
  const app = express();

  const sessions = new Map<string, Session>();

  app.get("/health", (_, res) => {
    res.status(200);
    res.end();
  });

  app.put("/session/:sessionId", (req, res) => {
    if (sessions.has(req.params.sessionId)) {
      res.status(409);
    } else {
      sessions.set(req.params.sessionId, { events: [], blobs: new Map() });
      res.status(201);
    }
    res.end();
  });

  const encoder = new Encoder();
  app.get("/session/:sessionId/events", (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (session === undefined) {
      res.status(404);
      res.end();
      return;
    }
    const response = encoder.encode(session.events);
    res.status(200);
    res.header("Content-Type", "application/vnd.msgpack");
    res.end(response);
  });

  app.post("/session/:sessionId/events", express.raw(), (req, res) => {
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
      res.status(404);
      res.end();
      return;
    }
    session.events.push(req.body);
    res.status(200);
    res.end();
  });

  app.put("/session/:sessionId/blob/:blobId", express.raw(), (req, res) => {
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
      res.status(404);
      res.end();
      return;
    }
    session.blobs.set(req.params.blobId, req.body);
    res.status(201);
    res.end();
  });

  app.get("/session/:sessionId/blob/:blobId", (req, res) => {
    const blob = sessions.get(req.params.sessionId)?.blobs.get(req.params.blobId);
    if (blob === undefined) {
      res.status(404);
      res.end();
      return;
    }
    res.status(200);
    res.header("Content-Type", "application/octet-stream");
    res.end(blob);
  });

  return app;
}
