import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

export function migrateBlobs(blobDirectory: string) {
  return async (db: DatabaseSync) => {
    const getBlobs = db.prepare(`SELECT uuid, data FROM job_blobs;`);
    const rows = getBlobs.all();
    for (const row of rows) {
      const uuid = row.uuid as string;
      const base = join(blobDirectory, uuid.slice(0, 2));
      const full = join(base, uuid);
      mkdirSync(base, { recursive: true });
      writeFileSync(full, row.data as Uint8Array<ArrayBuffer>);
    }
  };
}
