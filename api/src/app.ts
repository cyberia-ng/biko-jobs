import express from "express";
import { createServer } from "node:http";
import { addRoutes } from "./routes.ts";
import { WrappedWebSocketServer } from "./websockets.ts";
import { Database } from "./database.ts";
import {
  generateECDSAKeyPair,
  generateX25519KeyPair,
  KeyDerivationPassword,
} from "@biko-jobs/api-client/crypto.ts";

export async function createApp(sqlitePath?: string) {
  const app = express();
  const db = new Database(sqlitePath);
  if (sqlitePath === undefined) {
    await registerDummyMasterKey(db);
    if (process.env.NODE_ENV !== "test") {
      console.warn("WARNING: Server running with in-memory DB; dummy master key is registered.");
    }
  }
  const server = createServer(app);
  const wss = new WrappedWebSocketServer(server);
  addRoutes(app, db, wss.notifyClients.bind(wss));
  return server;
}

async function registerDummyMasterKey(db: Database) {
  const password = await KeyDerivationPassword.import("some password");
  const encryptionKeyPair = await generateX25519KeyPair("master key");
  const encryptionKeyPrivate = await encryptionKeyPair.privateKey.export(password);
  const signingKeyPair = await generateECDSAKeyPair();
  const signingKeyPrivate = await signingKeyPair.privateKey.export(password);
  db.addMasterKey({
    uuid: crypto.randomUUID(),
    name: "some name",
    encryptionKey: {
      public: await encryptionKeyPair.publicKey.export(),
      privateEncrypted: encryptionKeyPrivate.key.data,
      salt: encryptionKeyPrivate.salt.data,
    },
    signingKey: {
      public: await signingKeyPair.publicKey.export(),
      privateEncrypted: signingKeyPrivate.key.data,
      salt: signingKeyPrivate.salt.data,
    },
  });
}
