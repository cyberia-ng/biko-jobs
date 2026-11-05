import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "@biko-jobs/api/database.ts";

const dbFile = process.argv[2];
if (dbFile === undefined) {
  console.error("Specify database file as first argument");
  process.exit(1);
}

const blobDirectory = process.argv[3];
if (blobDirectory === undefined) {
  console.error("Specify blob directory as second argument");
  process.exit(1);
}

const db = new DatabaseSync(dbFile);
migrateDb(db, {}).catch((e) => {
  console.error(e);
  process.exit(1);
});
