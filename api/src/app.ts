import express from "express";

export const app = express();

app.get("/health", (_, res) => {
  res.status(200);
  res.end();
});
