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
import { allStatuses, type JobAction } from "../../src/service-state/action.ts";

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
        version: 2,
        uuid: createActionId,
        timestamp: Temporal.Instant.from(
          faker.date.recent({ days: { min: 0, max: 7 } }).toISOString(),
        ),
        event: {
          type: "upsert job",
          uuid: jobStream.uuid,
          tags: new Set(
            faker.helpers.multiple(() => faker.hacker.adjective(), { count: { min: 0, max: 3 } }),
          ),
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
      } satisfies JobAction,
    },
  ];
  const status = faker.helpers.maybe(() => faker.helpers.arrayElement(allStatuses.slice(1)));
  if (status !== undefined) {
    const changeStatusActionId = crypto.randomUUID();
    events.push({
      uuid: changeStatusActionId,
      stream: jobStream,
      data: {
        version: 2,
        uuid: changeStatusActionId,
        timestamp: Temporal.Instant.from(faker.date.past().toISOString()),
        event: {
          type: "change job status",
          uuid: jobStream.uuid,
          status,
        },
      } satisfies JobAction,
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
  const streamUUIDs = faker.helpers.multiple(() => crypto.randomUUID(), {
    count: { min: 5, max: 20 },
  });
  const streams = await Promise.all(
    streamUUIDs.map((uuid) => client.addStream(uuid, [mk.publicKey], authToken)),
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
