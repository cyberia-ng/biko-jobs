import type { Request, Response, NextFunction } from "express";
import type { Database } from "./database.ts";
import { AuthToken, Permission } from "@biko-jobs/api-client/schemas.ts";
import { mpDecoder, mpEncoder } from "@biko-jobs/api-client/messagepack.ts";
import { ECDSAPublicKey } from "@biko-jobs/api-client/crypto.ts";

export function verifier(db: Database, permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authorizationStr = req.header("authorization");
    if (authorizationStr === undefined) {
      res.status(401).send();
      return;
    }
    let authToken: AuthToken;
    try {
      const authorizationBytes = mpDecoder.decode(Uint8Array.fromBase64(authorizationStr));
      authToken = AuthToken.parse(authorizationBytes);
    } catch (_e) {
      res.status(401).send();
      return;
    }
    const keyBytes = db.getMasterSigningKey(authToken.masterKeyId);
    if (keyBytes === undefined) {
      res.status(401).send();
      return;
    }
    ECDSAPublicKey.import(keyBytes)
      .then((key) =>
        key.verify({
          signature: authToken.signature,
          data: mpEncoder.encode(authToken.authorization),
        }),
      )
      .then(() => authToken.authorization)
      .then((authorization) => {
        if (!authorization.permissions.has(permission)) {
          res.status(401).send();
          return;
        }
        if (authorization.expiry === "never") return next();
        const expiry = Temporal.Instant.from(authorization.expiry);
        if (Temporal.Instant.compare(expiry, Temporal.Now.instant()) === -1) {
          res.status(401).send();
        } else {
          next();
        }
      })
      .catch(() => res.status(401).send());
  };
}
