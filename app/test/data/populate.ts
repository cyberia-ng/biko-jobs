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
import { fakerEN_GB as faker } from "@faker-js/faker";
import { allStatuses, type StreamAction } from "../../src/service-state/action.ts";
import sharp from "sharp";

type Image = { fullSize: Buffer<ArrayBuffer>; thumbnail: Buffer<ArrayBuffer> };
async function loadImages() {
  const out: Image[] = [];
  for (let i = 1; i <= 5; i++) {
    const fullSize = readFileSync(join(import.meta.dirname, `img${i}.jpg`));
    // Params should match those in make-thumbnail.ts
    const MAX_WIDTH = 300;
    const MAX_HEIGHT = 300;
    const QUALITY = 0.8;
    const sharpImg = sharp(fullSize);
    const meta = await sharpImg.metadata();
    let { width, height } = meta;
    if (width > height) {
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
    } else {
      if (height > MAX_HEIGHT) {
        width = Math.round((width * MAX_HEIGHT) / height);
        height = MAX_HEIGHT;
      }
    }
    const thumbnail = Buffer.from(
      await sharpImg
        .autoOrient()
        .resize({ width, height })
        .jpeg({ quality: Math.round(QUALITY * 100) })
        .toBuffer(),
    );
    out.push({ fullSize, thumbnail });
  }
  return out;
}
function randomImage(images: Image[]): Image {
  return images[Math.floor(Math.random() * images.length)]!;
}

function randomJobData(jobStream: Stream, allImages: Image[]) {
  const images = faker.helpers
    .multiple(() => randomImage(allImages), {
      count: { min: 1, max: 3 },
    })
    .map((image) => ({
      imageBlob: {
        uuid: crypto.randomUUID(),
        data: image.fullSize,
        stream: jobStream,
      } satisfies StreamBlob,
      thumbnailBlob: {
        uuid: crypto.randomUUID(),
        data: image.thumbnail,
        stream: jobStream,
      } satisfies StreamBlob,
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
          images: images.map(({ imageBlob, thumbnailBlob }) => ({
            type: "image/jpeg",
            blobId: imageBlob.uuid,
            ...faker.helpers.maybe(() => ({
              thumbnail: {
                type: "image/jpeg",
                blobId: thumbnailBlob.uuid,
              },
            })),
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
  return { blobs: images.flatMap((image) => [image.imageBlob, image.thumbnailBlob]), events };
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
  const allImages = await loadImages();
  for (const stream of streams) {
    const { blobs, events } = randomJobData(stream, allImages);
    await Promise.all(blobs.map((blob) => client.putBlob(blob, authToken)));
    for (const event of events) {
      await client.addEvent(event, authToken);
    }
  }
}

main().catch(console.error);
