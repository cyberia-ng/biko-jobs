import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "@biko-jobs/api/database.ts";
import { dataMigration8Post } from "@biko-jobs/api/db-migrations/08-post.ts";

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
migrateDb(db, { 8: { post: dataMigration8Post } }).catch((e) => {
  console.error(e);
  process.exit(1);
});
