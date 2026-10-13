import type { Image, Job } from "./state.ts";

export type Action = {
  timestamp: Temporal.Instant;
  event: NewJob | ChangeJobStatus | DeleteJob | EditJob;
};

const withNow = (event: Action["event"]): Action => ({
  timestamp: Temporal.Now.instant(),
  event,
});

export type NewJob = {
  type: "new job";
  uuid: string;
  customerName: string;
  customerPhoneNumber?: string;
  description: string;
  images: Image[];
};
export const newJob = (f: Omit<NewJob, "type">) => withNow({ type: "new job", ...f });

export type ChangeJobStatus = {
  type: "change job status";
  uuid: string;
  status: Job["status"];
};
export const changeJobStatus = (f: Omit<ChangeJobStatus, "type">) =>
  withNow({ type: "change job status", ...f });

export type DeleteJob = {
  type: "delete job";
  uuid: string;
};
export const deleteJob = (f: Omit<DeleteJob, "type">) => withNow({ type: "delete job", ...f });

export type EditJob = {
  type: "edit job";
  uuid: string;
  customerName: string;
  customerPhoneNumber?: string;
  description: string;
  images: Image[];
};
export const editJob = (f: Omit<EditJob, "type">) => withNow({ type: "edit job", ...f });
