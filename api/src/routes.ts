import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { Database } from "./database.ts";
import { mpDecoder, mpEncoder } from "@biko-jobs/api-client/messagepack.ts";
import { z } from "zod";
import {
  StreamEvent,
  Stream,
  StreamList,
  StreamUUIDs,
  StreamEvents,
  SocketEvent,
  Bytes,
  MasterKey,
} from "@biko-jobs/api-client/schemas.ts";
import { verifier } from "./verification.ts";
import type { BlobStore } from "./blob-store.ts";

function msgPackBody(schema: z.ZodType, limit?: number) {
  return (req: Request, res: Response, next: NextFunction) =>
    express.raw({ type: "application/vnd.msgpack", limit })(req, res, (e: unknown) => {
      // oxlint-disable-next-line typescript/strict-boolean-expressions
      if (e) return next(e);
      try {
        const decoded = mpDecoder.decode(req.body);
        const validated = schema.parse(decoded);
        req.body = validated;
        next();
      } catch (_e) {
        res.status(400).send();
      }
    });
}

export function addRoutes(
  app: ReturnType<typeof express>,
  db: Database,
  blobStore: BlobStore,
  onEvent: (event: SocketEvent) => void,
) {
  app.use((_req, res, next) => {
    const originalSend = res.send.bind(res);
    res.send = (body: unknown) => {
      if (body === undefined) {
        return originalSend();
      } else if (body instanceof Uint8Array) {
        return originalSend(body);
      } else {
        const buf = mpEncoder.encode(body);
        res.header("Content-Type", "application/vnd.msgpack");
        return originalSend(buf);
      }
    };
    next();
  });

  app.get("/health", (_, res) => {
    res.status(200).send();
  });

  app.post("/master-keys", verifier(db, "add master key"), msgPackBody(MasterKey), (req, res) => {
    try {
      db.addMasterKey(req.body as MasterKey);
      res.status(200).send();
    } catch (e) {
      if (e === "already exists") res.status(409).send();
      else throw e;
    }
  });

  app.get("/master-keys", (_req, res) => {
    const keys = db.listMasterKeys();
    res.status(200).send(keys);
  });

  app.post("/master-keys/:uuid/get-private", msgPackBody(Bytes), (req, res) => {
    try {
      const key = db.getMasterKey(req.params.uuid as string, req.body as Bytes);
      res.status(200).send(key);
    } catch (e) {
      switch (e) {
        case "not found":
          res.status(404).send();
          return;
        case "bad hash":
          res.status(403).send();
          return;
        default:
          throw e;
      }
    }
  });

  app.put("/streams/:uuid", verifier(db, "create streams"), msgPackBody(Stream), (req, res) => {
    try {
      const stream = req.body as Stream;
      const streamId = db.addStream(stream);
      onEvent({
        type: "new stream",
        stream: { ...stream, number: streamId },
      } satisfies SocketEvent);
      res.status(201).send(streamId);
    } catch (e) {
      switch (e) {
        case "already exists":
          res.status(409).send();
          break;
        case "key mismatch":
          res.status(422).send();
          break;
        default:
          throw e;
      }
    }
  });

  app.get("/streams", verifier(db, "list streams"), (_req, res) => {
    const list: StreamList = db.getStreams();
    res.status(200).send(list);
  });

  app.post(
    "/events/by-streams",
    verifier(db, "read stream data"),
    msgPackBody(StreamUUIDs),
    (req, res) => {
      const events: StreamEvents = db.getEventsByStreams(req.body as StreamUUIDs);
      res.status(200).send(events);
    },
  );

  app.post("/events", verifier(db, "write stream data"), msgPackBody(StreamEvent), (req, res) => {
    const event = req.body as StreamEvent;
    try {
      db.addEvent(event);
      onEvent({ type: "stream event", event });
      res.status(200).send();
    } catch (e) {
      if (e === "already exists") res.status(409).send();
      else throw e;
    }
  });

  app.put(
    "/blobs/:uuid",
    verifier(db, "write stream data"),
    msgPackBody(Bytes, 15 * 1024 * 1024),
    (req, res, next) => {
      blobStore
        .put(req.params.uuid as string, req.body as Bytes)
        .then(() => res.status(201).send())
        .catch((e) => {
          if (e === "already exists") res.status(409).send();
          else next(e);
        });
    },
  );

  app.get("/blobs/:uuid", verifier(db, "read stream data"), (req, res, next) => {
    blobStore
      .get(req.params.uuid as string)
      .then((blob) => {
        if (blob === undefined) {
          res.status(404).send();
        } else {
          res.status(200).send(blob);
        }
      })
      .catch(next);
  });

  app.use(((err: any, _req, _res, next) => {
    console.debug(err);
    next(err);
  }) satisfies ErrorRequestHandler);
}
