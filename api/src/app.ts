import { Encoder } from "@msgpack/msgpack";
import express from "express";
import cors from "cors";

type Session = {
  events: Uint8Array[];
  blobs: Map<string, Uint8Array>;
};

type SessionId = string;
class Sessions {
  private sessions: Map<SessionId, Session>;

  constructor() {
    this.sessions = new Map();
  }

  session(id: string): Session {
    const session = this.sessions.get(id);
    if (session !== undefined) {
      return session;
    }
    const newSession: Session = {
      events: [],
      blobs: new Map(),
    };
    this.sessions.set(id, newSession);
    return newSession;
  }
}

export function createApp() {
  const app = express();
  app.use(cors());

  const sessions = new Sessions();

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

  app.post(
    "/session/:sessionId/events",
    express.raw({ limit: "100MB" /* TODO fix */ }),
    (req, res) => {
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
      res.status(200);
      res.end();
    },
  );

  app.put("/session/:sessionId/blob/:blobId", express.raw(), (req, res) => {
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

  return app;
}
