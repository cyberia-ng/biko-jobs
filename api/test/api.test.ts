import { createApp } from "@biko-jobs/api/app.ts";
import supertest from "supertest";
import { describe, test } from "vitest";

describe("api", () => {
  test("health endpoint", async () => {
    await supertest(createApp()).get("/health").expect(200);
  });
});
