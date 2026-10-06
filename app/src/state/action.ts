import type { Image } from "./state.ts";

export type Action = NewJob;

export type NewJob = {
  type: "new job";
  customerName: string;
  description: string;
  images: Image[];
};
