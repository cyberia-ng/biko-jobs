import { DatabaseSync } from "node:sqlite";
import { dataMigration3 } from "./03.ts";
import { migrateDb } from "@biko-jobs/api/database.ts";

const dbFile = process.argv[2];
if (dbFile === undefined) {
  console.error("Specify database file as argument");
  process.exit(1);
}

const db = new DatabaseSync(dbFile);
migrateDb(db, { 3: dataMigration3 }).catch(console.error);
