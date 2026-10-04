import "mocha";
import { app } from "@biko-jobs/api/app.ts";
import supertest from "supertest";

describe("api", () => {
  it("health endpoint", async () => {
    await supertest(app).get("/health").expect(200);
  });
});
