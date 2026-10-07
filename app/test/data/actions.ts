import { readFileSync } from "node:fs";
import type { NewJob } from "../../src/state/action.ts";
import { join } from "node:path";
import { ApiClient } from "@biko-jobs/api-client";

const img1 = readFileSync(join(import.meta.dirname, "img1.jpg"));
const img2 = readFileSync(join(import.meta.dirname, "img2.jpg"));
const img3 = readFileSync(join(import.meta.dirname, "img3.jpg"));
const img4 = readFileSync(join(import.meta.dirname, "img4.jpg"));
const img5 = readFileSync(join(import.meta.dirname, "img5.jpg"));
const newJob1: NewJob = {
  type: "new job",
  customerName: "Bob Bobson",
  description: `Brakes
    Front puncture
    Head gasket
    Wiper fluid
    New bell
    New exhaust
    Bottom text`,
  images: [
    { type: "image/jpeg", blobId: "img1" },
    { type: "image/jpeg", blobId: "img2" },
    { type: "image/jpeg", blobId: "img3" },
  ],
};

const newJob2: NewJob = {
  type: "new job",
  customerName: "Jim Jimson",
  description: `Rear mech issues `,
  images: [
    { type: "image/jpeg", blobId: "img4" },
    { type: "image/jpeg", blobId: "img5" },
  ],
};

async function main() {
  const client = await ApiClient.open("http://localhost:3000", "some-session", "some-password");
  await client.putBlob("img1", img1);
  await client.putBlob("img2", img2);
  await client.putBlob("img3", img3);
  await client.putBlob("img4", img4);
  await client.putBlob("img5", img5);
  await client.postEvent(newJob1);
  await client.postEvent(newJob2);
  client.closeWebSocket();
}

main().catch(console.error);
