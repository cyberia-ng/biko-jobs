import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { Database } from "./database.ts";
import { mpDecoder, mpEncoder } from "@biko-jobs/api-client/messagepack.ts";
import type { z } from "zod";
import {
  JobEvent,
  Job,
  JobList,
  JobUUIDs,
  MasterKey,
  JobEvents,
  JobBlob,
} from "@biko-jobs/api-client/schemas.ts";

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
  onEvent: (event: JobEvent) => void,
) {
  app.use((req, res, next) => {
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

  app.post("/master-keys", msgPackBody(MasterKey), (req, res) => {
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

  app.put("/jobs/:uuid", msgPackBody(Job), (req, res) => {
    try {
      db.addJob(req.body as Job);
      res.status(201).send();
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

  app.get("/jobs", (_req, res) => {
    const list: JobList = db.getJobs();
    res.status(200).send(list);
  });

  app.post("/events/by-jobs", msgPackBody(JobUUIDs), (req, res) => {
    const events: JobEvents = db.getEventsByJobs(req.body as JobUUIDs);
    res.status(200).send(events);
  });

  app.post("/events", msgPackBody(JobEvent), (req, res) => {
    const event = req.body as JobEvent;
    try {
      db.addEvent(event);
      onEvent(event);
      res.status(200).send();
    } catch (e) {
      if (e === "already exists") res.status(409).send();
      else throw e;
    }
  });

  app.post("/blobs", msgPackBody(JobBlob, 15 * 1024 * 1024), (req, res) => {
    try {
      db.addBlob(req.body as JobBlob);
      res.status(201).send();
    } catch (e) {
      if (e === "already exists") res.status(409).send();
      else throw e;
    }
  });

  app.get("/blobs/:uuid", (req, res) => {
    const blob = db.getBlob(req.params.uuid);
    if (blob === undefined) {
      res.status(404).send();
    } else {
      res.status(200).send(blob);
    }
  });

  app.use(((err: any, _req, _res, next) => {
    console.debug(err);
    next(err);
  }) satisfies ErrorRequestHandler);
}
