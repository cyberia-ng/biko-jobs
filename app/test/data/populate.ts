import "temporal-polyfill/global";
import { readFileSync } from "node:fs";
import { upsertJob } from "../../src/service-state/action.ts";
import { join } from "node:path";
import { ApiClient, Job, MasterKeyPair, type JobBlob, type JobEvent } from "@biko-jobs/api-client";

const img1 = readFileSync(join(import.meta.dirname, "img1.jpg"));
const img2 = readFileSync(join(import.meta.dirname, "img2.jpg"));
const img3 = readFileSync(join(import.meta.dirname, "img3.jpg"));
const img4 = readFileSync(join(import.meta.dirname, "img4.jpg"));
const img5 = readFileSync(join(import.meta.dirname, "img5.jpg"));
const upsertJob1 = (job: Job, imgs: JobBlob[]): JobEvent => ({
  uuid: crypto.randomUUID(),
  job,
  data: upsertJob({
    uuid: job.uuid,
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
    images: imgs.map((img) => ({ type: "image/jpeg", blobId: img.uuid })),
  }),
});

const upsertJob2 = (job: Job, imgs: JobBlob[]): JobEvent => {
  const event = {
    uuid: crypto.randomUUID(),
    job,
    data: upsertJob({
      uuid: "46bc5898-12de-4721-b9ed-deecd548699b",
      customerName: "Jim Jimson",
      customerPhoneNumber: "",
      description: `Rear mech issues `,
      tags: new Set(),
      images: imgs.map((img) => ({ type: "image/jpeg", blobId: img.uuid })),
    }),
  };
  event.data.timestamp = Temporal.Now.instant().subtract({ hours: 2 });
  return event;
};

async function main() {
  const client = new ApiClient("http://localhost:3000");
  const mk = await MasterKeyPair.generate("some name", "some password");
  await client.addMasterKeyPair(mk);
  const job1 = await Job.generate(crypto.randomUUID());
  const job2 = await Job.generate(crypto.randomUUID());
  await client.addJob(job1, [mk]);
  await client.addJob(job2, [mk]);
  const job1Blobs = [img1, img2, img3].map((img) => ({
    uuid: crypto.randomUUID(),
    data: img,
    job: job1,
  }));
  const job2Blobs = [img4, img5].map((img) => ({
    uuid: crypto.randomUUID(),
    data: img,
    job: job2,
  }));
  await Promise.all([...job1Blobs, ...job2Blobs].map((blob) => client.putBlob(blob)));
  await client.addEvent(upsertJob1(job1, job1Blobs));
  await client.addEvent(upsertJob2(job2, job2Blobs));
}

main().catch(console.error);
