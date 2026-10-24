import { createApp } from "./app.ts";

createApp(process.env["SQLITE_PATH"])
  .then((server) => {
    server.listen(3000, () => {
      console.log("Server is running on port 3000");
    });
    process.on("SIGINT", () => {
      server.close(() => {
        process.exit(0);
      });
    });
  })
  .catch(console.error);
