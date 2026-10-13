import type { ActionV1 } from "./actions/v1.ts";
import { allStatusesV2 } from "./actions/v2.ts";
import type { ActionV2, JobV2 } from "./actions/v2.ts";

export type AnyVersionAction = ActionV1 | ActionV2;

export type Action = ActionV2;
export type Job = JobV2;

export const allStatuses = allStatusesV2;

const withNow = (event: Action["event"]): Action => ({
  version: 2,
  uuid: crypto.randomUUID(),
  timestamp: Temporal.Now.instant(),
  event,
});

type Event<T extends string> = Omit<Extract<Action["event"], { type: T }>, "type">;

export const newJob = (f: Event<"new job">) => withNow({ type: "new job", ...f });

export const changeJobStatus = (f: Event<"change job status">) =>
  withNow({ type: "change job status", ...f });

export const deleteJob = (f: Event<"delete job">) => withNow({ type: "delete job", ...f });

export const editJob = (f: Event<"edit job">) => withNow({ type: "edit job", ...f });
