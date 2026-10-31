import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "@biko-jobs/api/database.ts";
import { dataMigration5 } from "@biko-jobs/api/db-migrations/05.ts";

const dbFile = process.argv[2];
if (dbFile === undefined) {
  console.error("Specify database file as argument");
  process.exit(1);
}

const db = new DatabaseSync(dbFile);
migrateDb(db, { 5: dataMigration5 }).catch((e) => {
  console.error(e);
  process.exit(1);
});
