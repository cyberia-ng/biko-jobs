import { Encoder } from "@msgpack/msgpack";
import type { Sessions } from "./sessions.ts";
import express from "express";

export function addRoutes(
  app: ReturnType<typeof express>,
  sessions: Sessions,
  onEvent: (session: string, event: Uint8Array<ArrayBuffer>) => void,
) {
  app.get("/health", (_, res) => {
    res.status(200);
    res.end();
  });

  const encoder = new Encoder();
  app.get("/session/:session/events", (req, res) => {
    const response = encoder.encode(sessions.events(req.params.session));
    res.status(200);
    res.header("Content-Type", "application/vnd.msgpack");
    res.end(response);
  });

  app.post("/session/:session/events", express.raw(), (req, res) => {
    if (req.body === undefined) {
      res.status(400);
      res.end();
      return;
    }
    if (!(req.body instanceof Buffer)) {
      throw new Error("unreachable: expected Buffer");
    }
    sessions.addEvent(req.params.session, req.body);
    onEvent(req.params.session, req.body);
    res.status(200);
    res.end();
  });

  app.put("/session/:session/blob/:blob", express.raw({ limit: "10MB" }), (req, res) => {
    if (req.body === undefined) {
      res.status(400);
      res.end();
      return;
    }
    if (!(req.body instanceof Buffer)) {
      throw new Error("unreachable: expected Buffer");
    }
    sessions.addBlob(req.params.session, req.params.blob, req.body);
    res.status(201);
    res.end();
  });

  app.get("/session/:session/blob/:blob", (req, res) => {
    const blob = sessions.blob(req.params.session, req.params.blob);
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
    res.json(sessions.sessionNames());
  });
}
