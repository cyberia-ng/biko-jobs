import { MasterKeyPair } from "@biko-jobs/api-client";
import { createApp } from "./app.ts";

async function main() {
  const sqlitePath = process.env["SQLITE_PATH"];
  let initialMasterKey: MasterKeyPair | undefined;
  if (sqlitePath === undefined) {
    initialMasterKey = await MasterKeyPair.generate(
      crypto.randomUUID(),
      "some name",
      "some password",
    );
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "WARNING: Server running with in-memory DB; dummy master key will be registered.",
      );
    }
  }
  const blobDirectory = process.env["BLOB_DIRECTORY"];
  const server = await createApp({ sqlitePath, initialMasterKey, blobDirectory });
  server.listen(3000, () => {
    console.log("Server is running on port 3000");
  });
  process.on("SIGINT", () => {
    server.close(() => {
      process.exit(0);
    });
  });
}

main().catch(console.error);
