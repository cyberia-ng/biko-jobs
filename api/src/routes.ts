import { Encoder } from "@msgpack/msgpack";
import type { Sessions } from "./sessions.ts";
import express from "express";

export function addRoutes(
  app: ReturnType<typeof express>,
  sessions: Sessions,
  onEvent: (sessionId: string, event: Uint8Array<ArrayBuffer>) => void,
) {
  app.get("/health", (_, res) => {
    res.status(200);
    res.end();
  });

  const encoder = new Encoder();
  app.get("/session/:sessionId/events", (req, res) => {
    const session = sessions.session(req.params.sessionId);
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
    const session = sessions.session(req.params.sessionId);
    session.events.push(req.body);
    onEvent(req.params.sessionId, req.body);
    res.status(200);
    res.end();
  });

  app.put("/session/:sessionId/blob/:blobId", express.raw({ limit: "10MB" }), (req, res) => {
    if (req.body === undefined) {
      res.status(400);
      res.end();
      return;
    }
    if (!(req.body instanceof Buffer)) {
      throw new Error("unreachable: expected Buffer");
    }
    const session = sessions.session(req.params.sessionId);
    session.blobs.set(req.params.blobId, req.body);
    res.status(201);
    res.end();
  });

  app.get("/session/:sessionId/blob/:blobId", (req, res) => {
    const blob = sessions.session(req.params.sessionId).blobs.get(req.params.blobId);
    if (blob === undefined) {
      res.status(404);
      res.end();
      return;
    }
    res.status(200);
    res.header("Content-Type", "application/octet-stream");
    res.end(blob);
  });

  app.get("/session", (req, res) => {
    res.status(200);
    res.json(sessions.sessionIds());
  });
}
