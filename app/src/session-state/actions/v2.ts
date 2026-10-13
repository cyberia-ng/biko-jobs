import omit from "lodash/omit.js";
import { allStatusesV1, type ActionV1, type DeleteJobV1, type ImageV1, type JobV1 } from "./v1.ts";

export type ActionV2 = Omit<ActionV1, "event"> & {
  version: 2;
  uuid: string;
  event: UpsertJobV2 | ChangeJobStatusV2 | AddJobTagV2 | RemoveJobTagV2 | DeleteJobV1;
};

export type JobV2 = Omit<JobV1, "status"> & {
  status: (typeof allStatusesV2)[number];
  tags: Set<string>;
};

export type UpsertJobV2 = {
  type: "upsert job";
  uuid: string;
  tags: Set<string>;
  customerName: string;
  customerPhoneNumber: string;
  description: string;
  images: ImageV1[];
};

export type ChangeJobStatusV2 = {
  type: "change job status";
  uuid: string;
  status: JobV2["status"];
};

export type AddJobTagV2 = {
  type: "add job tag";
  uuid: string;
  tag: string;
};

export type RemoveJobTagV2 = {
  type: "remove job tag";
  uuid: string;
  tag: string;
};

export const allStatusesV2 = [...allStatusesV1, "cancelled"] as const;

export function migrateFromV1(action: ActionV1): ActionV2 {
  const uuid = crypto.randomUUID(); // Non-deterministic

  let event: ActionV2["event"];
  switch (action.event.type) {
    case "new job":
    case "edit job":
      event = {
        type: "upsert job",
        ...omit(action.event, "type"),
        tags: new Set(),
      } satisfies UpsertJobV2;
      break;
    case "delete job":
    case "change job status":
      event = action.event;
      break;
  }
  return {
    version: 2,
    uuid,
    ...omit(action, "event"),
    event,
  };
}
