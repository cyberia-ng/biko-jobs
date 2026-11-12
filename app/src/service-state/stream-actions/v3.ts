import { type DeleteJobV1 } from "./v1.ts";
import type { ActionV2, ChangeJobStatusV2, SetJobArchivedV2, UpsertJobV2 } from "./v2.ts";

export type ActionV3 = Omit<ActionV2, "event" | "version" | "uuid" | "timestamp"> & {
  version: 3;
} & (JobActionV3 | MechanicListActionV3);

type JobActionV3 = {
  type: "job action";
  timestamp: Temporal.Instant;
  jobAction:
    | Omit<UpsertJobV2, "uuid" | "tags">
    | Omit<ChangeJobStatusV2, "uuid">
    | Omit<DeleteJobV1, "uuid">
    | Omit<SetJobArchivedV2, "uuid">
    | SetJobBlockedV3;
};
type MechanicListActionV3 = { type: "mechanic list action" };

type SetJobBlockedV3 = {
  type: "set job blocked";
  blocked: false | string;
};

export function migrateFromV2(action: ActionV2): ActionV3[] {
  if (action.event.type === "add job tag" || action.event.type === "remove job tag") return [];
  return [
    {
      version: 3,
      type: "job action",
      timestamp: action.timestamp,
      jobAction: action.event,
    },
  ];
}
