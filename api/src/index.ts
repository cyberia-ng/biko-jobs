import { createApp } from "./app.ts";

const server = createApp(process.env["SQLITE_PATH"]).listen(3000, () => {
  console.log("Server is running on port 3000");
});

process.on("SIGINT", () => {
  server.close(() => {
    process.exit(0);
  });
});
