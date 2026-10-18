import "temporal-polyfill/global";
import { readFileSync } from "node:fs";
import { upsertJob } from "../../src/session-state/action.ts";
import { join } from "node:path";
import { ApiClient } from "@biko-jobs/api-client";

const img1 = readFileSync(join(import.meta.dirname, "img1.jpg"));
const img2 = readFileSync(join(import.meta.dirname, "img2.jpg"));
const img3 = readFileSync(join(import.meta.dirname, "img3.jpg"));
const img4 = readFileSync(join(import.meta.dirname, "img4.jpg"));
const img5 = readFileSync(join(import.meta.dirname, "img5.jpg"));
const newJob1 = upsertJob({
  uuid: "7f0f7f6b-1c80-4b92-9003-ae0a1a902ff4",
  customerName: "Bob Bobson",
  customerPhoneNumber: "07123456789",
  description: `Brakes
Front puncture
Head gasket
Wiper fluid
New bell
New exhaust
Bottom text`,
  tags: new Set(["difficult"]),
  images: [
    { type: "image/jpeg", blobId: "img1" },
    { type: "image/jpeg", blobId: "img2" },
    { type: "image/jpeg", blobId: "img3" },
  ],
});

const newJob2 = upsertJob({
  uuid: "46bc5898-12de-4721-b9ed-deecd548699b",
  customerName: "Jim Jimson",
  customerPhoneNumber: "",
  description: `Rear mech issues `,
  tags: new Set(),
  images: [
    { type: "image/jpeg", blobId: "img4" },
    { type: "image/jpeg", blobId: "img5" },
  ],
});
newJob2.timestamp = Temporal.Now.instant().subtract({ hours: 2 });

async function main() {
  const client = await ApiClient.open("http://localhost:3000", "some session", "some password");
  try {
    await Promise.all([
      client.putBlob("img1", img1),
      client.putBlob("img2", img2),
      client.putBlob("img3", img3),
      client.putBlob("img4", img4),
      client.putBlob("img5", img5),
    ]);
  } catch (e) {
    if (!/409/.test((e as Error).message)) {
      throw e;
    }
  }
  await client.postEvent({ uuid: newJob1.uuid, data: newJob1 });
  await client.postEvent({ uuid: newJob2.uuid, data: newJob2 });
  client.closeWebSocket();
}

main().catch(console.error);
