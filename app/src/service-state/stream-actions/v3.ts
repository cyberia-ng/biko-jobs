import { type DeleteJobV1 } from "./v1.ts";
import type {
  ActionV2,
  AddJobTagV2,
  ChangeJobStatusV2,
  RemoveJobTagV2,
  SetJobArchivedV2,
  UpsertJobV2,
} from "./v2.ts";

export type ActionV3 = Omit<ActionV2, "event" | "version" | "uuid" | "timestamp"> & {
  version: 3;
} & (JobActionV3 | MechanicListActionV3);

type JobActionV3 = {
  type: "job action";
  timestamp: Temporal.Instant;
  jobAction:
    | Omit<UpsertJobV2, "uuid">
    | Omit<ChangeJobStatusV2, "uuid">
    | Omit<AddJobTagV2, "uuid">
    | Omit<RemoveJobTagV2, "uuid">
    | Omit<DeleteJobV1, "uuid">
    | Omit<SetJobArchivedV2, "uuid">;
};
type MechanicListActionV3 = { type: "mechanic list action" };

export function migrateFromV2(action: ActionV2): ActionV3 {
  return {
    version: 3,
    type: "job action",
    timestamp: action.timestamp,
    jobAction: action.event,
  };
}
