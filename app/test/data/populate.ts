import "temporal-polyfill/global";
import { readFileSync } from "node:fs";
import { upsertJob } from "../../src/service-state/action.ts";
import { join } from "node:path";
import { ApiClient, Job, MasterKeyPair, type JobBlob, type JobEvent } from "@biko-jobs/api-client";

const img1 = {
  uuid: "10000000-0000-4000-8000-000000000001",
  data: readFileSync(join(import.meta.dirname, "img1.jpg")),
};
const img2 = {
  uuid: "10000000-0000-4000-8000-000000000002",
  data: readFileSync(join(import.meta.dirname, "img2.jpg")),
};
const img3 = {
  uuid: "10000000-0000-4000-8000-000000000003",
  data: readFileSync(join(import.meta.dirname, "img3.jpg")),
};
const img4 = {
  uuid: "10000000-0000-4000-8000-000000000004",
  data: readFileSync(join(import.meta.dirname, "img4.jpg")),
};
const img5 = {
  uuid: "10000000-0000-4000-8000-000000000005",
  data: readFileSync(join(import.meta.dirname, "img5.jpg")),
};
const upsertJob1 = (job: Job, imgs: JobBlob[]): JobEvent => ({
  uuid: "30000000-0000-4000-8000-000000000000",
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
    uuid: "30000000-0000-4000-8000-000000000001",
    job,
    data: upsertJob({
      uuid: job.uuid,
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
  const mk = await MasterKeyPair.generate(
    "20000000-0000-4000-8000-000000000000",
    "some name",
    "some password",
  );
  await client.addMasterKeyPair(mk);
  const job1 = await Job.generate("00000000-0000-4000-8000-000000000000");
  const job2 = await Job.generate("00000000-0000-4000-8000-000000000001");
  await client.addJob(job1, [mk]);
  await client.addJob(job2, [mk]);
  const job1Blobs = [img1, img2, img3].map((img) => ({
    uuid: img.uuid,
    data: img.data,
    job: job1,
  }));
  const job2Blobs = [img4, img5].map((img) => ({
    uuid: img.uuid,
    data: img.data,
    job: job2,
  }));
  await Promise.all([...job1Blobs, ...job2Blobs].map((blob) => client.putBlob(blob)));
  await client.addEvent(upsertJob1(job1, job1Blobs));
  await client.addEvent(upsertJob2(job2, job2Blobs));
}

main().catch(console.error);
