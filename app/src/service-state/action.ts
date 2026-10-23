import type { ActionV1 as JobActionV1, ImageV1 } from "./job-actions/v1.ts";
import { allStatusesV2 } from "./job-actions/v2.ts";
import type { ActionV2 as JobActionV2 } from "./job-actions/v2.ts";

export type AnyVersionJobAction = JobActionV1 | JobActionV2;

export type JobAction = JobActionV2;

export type Action =
  | { type: "create job"; uuid: string; number: number }
  | { type: "job action"; action: JobAction };
export type Image = ImageV1;
export const allStatuses = allStatusesV2;

const withNow = (event: JobAction["event"]): JobAction => ({
  version: 2,
  uuid: crypto.randomUUID(),
  timestamp: Temporal.Now.instant(),
  event,
});

type Event<T extends string> = Omit<Extract<JobAction["event"], { type: T }>, "type">;

export const upsertJob = (f: Event<"upsert job">) => withNow({ type: "upsert job", ...f });

export const changeJobStatus = (f: Event<"change job status">) =>
  withNow({ type: "change job status", ...f });

export const deleteJob = (f: Event<"delete job">) => withNow({ type: "delete job", ...f });

export const addJobTag = (f: Event<"add job tag">) => withNow({ type: "add job tag", ...f });

export const removeJobTag = (f: Event<"remove job tag">) =>
  withNow({ type: "remove job tag", ...f });

export const setJobArchived = (f: Event<"set job archived">) =>
  withNow({ type: "set job archived", ...f });
