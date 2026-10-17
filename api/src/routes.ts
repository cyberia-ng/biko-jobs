import { Encoder } from "@msgpack/msgpack";
import { FinalizationData, type Sessions } from "./sessions.ts";
import express from "express";
import { mpDecoder } from "@biko-jobs/api-client/messagepack.ts";

export function addRoutes(
  app: ReturnType<typeof express>,
  sessions: Sessions,
  onEvent: (session: string, event: Uint8Array<ArrayBuffer>) => void,
) {
  app.get("/health", (_, res) => {
    res.status(200).send();
  });

  const encoder = new Encoder();
  app.get("/session/:session/events", (req, res) => {
    const response = encoder.encode(sessions.events(req.params.session));
    res.status(200);
    res.header("Content-Type", "application/vnd.msgpack");
    res.send(response);
  });

  app.post("/session/:session/events", express.raw(), (req, res) => {
    if (req.body === undefined) {
      res.status(400).send();
      return;
    }
    if (!(req.body instanceof Buffer)) {
      throw new Error("unreachable: expected Buffer");
    }

    try {
      sessions.addEvent(req.params.session, req.body);
      onEvent(req.params.session, req.body);
      res.status(200).send();
    } catch (e) {
      if (e === "session finalized") {
        res.header("Allow", "GET, HEAD");
        res.status(405).send();
        return;
      } else throw e;
    }
  });

  app.put("/session/:session/blob/:blob", express.raw({ limit: "10MB" }), (req, res) => {
    if (req.body === undefined) {
      res.status(400).send();
      return;
    }
    if (!(req.body instanceof Buffer)) {
      throw new Error("unreachable: expected Buffer");
    }
    try {
      sessions.addBlob(req.params.session, req.params.blob, req.body);
      res.status(201).send();
    } catch (e) {
      switch (e) {
        case "conflict":
          res.status(409).send();
          return;
        case "session finalized":
          res.status(405).header("Allow", "GET, HEAD").send();
          return;
        default:
          throw e;
      }
    }
  });

  app.get("/session/:session/blob/:blob", (req, res) => {
    const blob = sessions.blob(req.params.session, req.params.blob);
    if (blob === undefined) {
      res.status(404).send();
      return;
    }
    res.status(200);
    res.header("Content-Type", "application/octet-stream");
    res.send(blob);
  });

  app.get("/session", (_req, res) => {
    res.status(200);
    res.json(sessions.sessions());
  });

  app.post(
    "/session/:session/finalize",
    express.raw({ type: "application/vnd.msgpack" }),
    (req, res) => {
      if (req.body === undefined) {
        res.status(400).send();
        return;
      }
      if (!(req.body instanceof Buffer)) {
        throw new Error("unreachable: expected Buffer");
      }
      let finalizationData: FinalizationData;
      try {
        const decoded = mpDecoder.decode(req.body);
        finalizationData = FinalizationData.parse(decoded);
      } catch (_e) {
        res.status(400).send();
        return;
      }
      try {
        sessions.finalize(req.params.session, finalizationData);
        res.status(200).send();
      } catch (e) {
        switch (e) {
          case "session finalized":
            res.status(409).send();
            break;
          case "existing events hash mismatch":
            res.status(422).send();
            break;
          default:
            throw e;
        }
      }
    },
  );
}
