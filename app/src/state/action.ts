import type { Image, Job } from "./state.ts";

export type Action = Event | UpdateSessionsList | ResetSession;

export type Event = {
  type: "event";
  timestamp: Temporal.Instant;
  event: NewJob | ChangeJobStatus | DeleteJob | EditJob;
};
const event = (event: Event["event"]): Event => ({
  type: "event",
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
export const newJob = (f: Omit<NewJob, "type">) => event({ type: "new job", ...f });

export type ChangeJobStatus = {
  type: "change job status";
  uuid: string;
  status: Job["status"];
};
export const changeJobStatus = (f: Omit<ChangeJobStatus, "type">) =>
  event({ type: "change job status", ...f });

export type DeleteJob = {
  type: "delete job";
  uuid: string;
};
export const deleteJob = (f: Omit<DeleteJob, "type">) => event({ type: "delete job", ...f });

export type EditJob = {
  type: "edit job";
  uuid: string;
  customerName: string;
  customerPhoneNumber?: string;
  description: string;
  images: Image[];
};
export const editJob = (f: Omit<EditJob, "type">) => event({ type: "edit job", ...f });

export type UpdateSessionsList = {
  type: "update sessions list";
  sessions: string[];
};

export type ResetSession = {
  type: "reset session";
};
