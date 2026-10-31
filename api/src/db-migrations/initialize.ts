import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Database, migrateDb } from "@biko-jobs/api/database.ts";
import { DatabaseSync } from "node:sqlite";
import { MasterKeyPair } from "@biko-jobs/api-client";

async function main() {
  const dbFile = process.argv[2];
  if (dbFile === undefined) {
    console.error("Specify database file as argument");
    process.exit(1);
  }

  const dbRaw = new DatabaseSync(dbFile);
  await migrateDb(dbRaw, {});
  dbRaw.close();
  const db = new Database(dbFile);
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const masterKeyName = await rl.question("New master key name: ");
    const masterKeyPassword = await rl.question("New master key password: ");
    const mkPair = await MasterKeyPair.generate(
      crypto.randomUUID(),
      masterKeyName,
      masterKeyPassword,
    );
    db.addMasterKey(await mkPair.toWireFormat());
    console.log("registered master key");
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
