import { createApp } from "./app.ts";

createApp(process.env["SQLITE_PATH"]).listen(3000, () => {
  console.log("Server is running on port 3000");
});
