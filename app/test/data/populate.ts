import "temporal-polyfill/global";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ApiClient,
  AuthToken,
  Stream,
  MasterKeyPassword,
  type StreamBlob,
  type StreamEvent,
} from "@biko-jobs/api-client";
import range from "lodash/range.js";
import { fakerEN_GB as faker } from "@faker-js/faker";
import { allStatuses, type StreamAction } from "../../src/service-state/action.ts";

const images = range(1, 5 + 1).map((n) => readFileSync(join(import.meta.dirname, `img${n}.jpg`)));
function randomImage() {
  return images[Math.floor(Math.random() * images.length)]!;
}

function randomJobData(jobStream: Stream) {
  const images = faker.helpers.multiple(randomImage, { count: { min: 1, max: 3 } });
  const imageBlobs = images.map((image): StreamBlob => ({
    uuid: crypto.randomUUID(),
    data: image,
    stream: jobStream,
  }));
  const createActionId = crypto.randomUUID();
  const events: StreamEvent[] = [
    {
      uuid: createActionId,
      stream: jobStream,
      data: {
        version: 3,
        type: "job action",
        timestamp: Temporal.Instant.from(
          faker.date.recent({ days: { min: 0, max: 7 } }).toISOString(),
        ),
        jobAction: {
          type: "upsert job",
          customerName: faker.person.firstName(),
          customerPhoneNumber: faker.phone.number(),
          description: faker.helpers
            .multiple(() => faker.company.buzzPhrase(), { count: { min: 1, max: 5 } })
            .join("\n"),
          images: imageBlobs.map((blob) => ({
            type: "image/jpeg",
            blobId: blob.uuid,
          })),
        },
      } satisfies StreamAction,
    },
  ];
  const status = faker.helpers.arrayElement(allStatuses);
  if (status !== "triaged") {
    events.push({
      uuid: crypto.randomUUID(),
      stream: jobStream,
      data: {
        version: 3,
        type: "job action",
        timestamp: Temporal.Instant.from(faker.date.past().toISOString()),
        jobAction: {
          type: "change job status",
          status,
        },
      } satisfies StreamAction,
    });
  }
  const blocked = faker.helpers.maybe(() => faker.company.buzzPhrase());
  if (blocked !== undefined) {
    events.push({
      uuid: crypto.randomUUID(),
      stream: jobStream,
      data: {
        version: 3,
        type: "job action",
        timestamp: Temporal.Instant.from(faker.date.past().toISOString()),
        jobAction: {
          type: "set job blocked",
          blocked,
        },
      } satisfies StreamAction,
    });
  }
  return { blobs: imageBlobs, events };
}

async function main() {
  const client = new ApiClient("http://localhost:3000");
  const mks = await client.listMasterKeys();
  const mkPublic = mks.find((mk) => mk.name === "some name")!;
  const mkPassword = await MasterKeyPassword.init(mkPublic, "some password");
  const mk = await client.getMasterKeyPair(mkPassword);
  const authToken = await AuthToken.init({
    masterKey: mk,
    expiry: Temporal.Now.instant().add(Temporal.Duration.from({ hours: 1 })),
    permissions: new Set(["create streams", "write stream data"]),
  });
  const streamNames = faker.helpers.multiple(() => crypto.randomUUID(), {
    count: { min: 5, max: 20 },
  });
  const streams = await Promise.all(
    streamNames.map((name) => client.addStream({ name, access: [mk.publicKey] }, authToken)),
  );
  for (const stream of streams) {
    const { blobs, events } = randomJobData(stream);
    await Promise.all(blobs.map((blob) => client.putBlob(blob, authToken)));
    for (const event of events) {
      await client.addEvent(event, authToken);
    }
  }
}

main().catch(console.error);
