import { createApp } from "@biko-jobs/api/app.ts";
import supertest from "supertest";
import { describe, test } from "vitest";

describe("api", () => {
  // oxlint-disable-next-line jest/expect-expect
  test("health endpoint", async () => {
    await supertest(await createApp())
      .get("/health")
      .expect(200);
  });
});
