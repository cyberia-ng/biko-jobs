import type { Image, Job } from "./state.ts";

export type Action = NewJob | ChangeJobStatus | DeleteJob | EditJob;

export type NewJob = {
  type: "new job";
  customerName: string;
  description: string;
  images: Image[];
};

export type ChangeJobStatus = {
  type: "change job status";
  jobNumber: number;
  status: Job["status"];
};

export type DeleteJob = {
  type: "delete job";
  jobNumber: number;
};

export type EditJob = {
  type: "edit job";
  jobNumber: number;
  customerName: string;
  description: string;
  images: Image[];
};
