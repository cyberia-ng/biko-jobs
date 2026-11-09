import type { ActionV1 as StreamActionV1, ImageV1 } from "./stream-actions/v1.ts";
import { allStatusesV2 } from "./stream-actions/v2.ts";
import type { ActionV2 as StreamActionV2 } from "./stream-actions/v2.ts";
import type { ActionV3 as StreamActionV3 } from "./stream-actions/v3.ts";

export type AnyVersionStreamAction = StreamActionV1 | StreamActionV2 | StreamActionV3;

export type StreamAction = StreamActionV3;

export type WrappedStreamAction = {
  actionUUID: string;
  streamName: string;
  streamNumber: number;
  inner: StreamActionV3;
};
export type Image = ImageV1;
export const allStatuses = allStatusesV2;

type JobAction = Extract<StreamAction, { type: "job action" }>["jobAction"];
const jobNow = (event: JobAction): StreamAction => ({
  version: 3,
  type: "job action",
  timestamp: Temporal.Now.instant(),
  jobAction: event,
});

type JobActionOf<T extends string> = Omit<Extract<JobAction, { type: T }>, "type">;

export const upsertJob = (f: JobActionOf<"upsert job">) => jobNow({ type: "upsert job", ...f });

export const changeJobStatus = (status: (typeof allStatuses)[number]) =>
  jobNow({ type: "change job status", status });

export const deleteJob = () => jobNow({ type: "delete job" });

export const addJobTag = (tag: string) => jobNow({ type: "add job tag", tag });

export const removeJobTag = (tag: string) => jobNow({ type: "remove job tag", tag });

export const setJobArchived = (archived: boolean) => jobNow({ type: "set job archived", archived });
