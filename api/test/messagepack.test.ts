import { mpDecoder, mpEncoder } from "@biko-jobs/api-client/messagepack.ts";
import { describe, expect, test } from "vitest";

describe("messagepack codec", () => {
  describe("temporal handling", () => {
    test("date before 1970", () => {
      const instant = Temporal.Instant.from("1969-07-20T20:17:40Z");
      expect(
        Temporal.Instant.compare(
          instant,
          mpDecoder.decode(mpEncoder.encode(instant)) as Temporal.Instant,
        ),
      ).toBe(0);
    });

    test("date after 1970", () => {
      const instant = Temporal.Instant.from("2000-01-01T00:00:00Z");
      expect(
        Temporal.Instant.compare(
          instant,
          mpDecoder.decode(mpEncoder.encode(instant)) as Temporal.Instant,
        ),
      ).toBe(0);
    });

    test("epoch -1 nanosecond", () => {
      const instant = Temporal.Instant.fromEpochNanoseconds(-1n);
      expect(
        Temporal.Instant.compare(
          instant,
          mpDecoder.decode(mpEncoder.encode(instant)) as Temporal.Instant,
        ),
      ).toBe(0);
    });

    test("epoch +1 nanosecond", () => {
      const instant = Temporal.Instant.fromEpochNanoseconds(1n);
      expect(
        Temporal.Instant.compare(
          instant,
          mpDecoder.decode(mpEncoder.encode(instant)) as Temporal.Instant,
        ),
      ).toBe(0);
    });
  });
});
