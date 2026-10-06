import type { NewJob } from "../../src/state/action.ts";
// @ts-expect-error
import img1Url from "./img1.jpg";
// @ts-expect-error
import img2Url from "./img2.jpg";
// @ts-expect-error
import img3Url from "./img3.jpg";
// @ts-expect-error
import img4Url from "./img4.jpg";
// @ts-expect-error
import img5Url from "./img5.jpg";
// @ts-expect-error
import img6Url from "./img6.jpg";

export async function newJob1(): Promise<NewJob> {
  const img1 = await (await fetch(img1Url)).bytes();
  const img2 = await (await fetch(img2Url)).bytes();
  const img3 = await (await fetch(img3Url)).bytes();
  return {
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
      { type: "image/jpeg", data: img1 },
      { type: "image/jpeg", data: img2 },
      { type: "image/jpeg", data: img3 },
    ],
  };
}

export async function newJob2(): Promise<NewJob> {
  const img4 = await (await fetch(img4Url)).bytes();
  const img5 = await (await fetch(img5Url)).bytes();
  return {
    type: "new job",
    customerName: "Jim Jimson",
    description: `Rear mech issues `,
    images: [
      { type: "image/jpeg", data: img4 },
      { type: "image/jpeg", data: img5 },
    ],
  };
}
