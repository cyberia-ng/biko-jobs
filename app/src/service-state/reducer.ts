import { produce } from "immer";
import type { WrappedStreamAction } from "./action.ts";
import type { State } from "./state.ts";
import pick from "lodash/pick.js";
import { assertNever } from "../assert-never.ts";

export function reducer(state: State, action: WrappedStreamAction): State {
  return produce(state, (state) => {
    if (state.processedJobActions.has(action.actionUUID)) {
      return;
    }
    state.processedJobActions.add(action.actionUUID);
    const { inner } = action;
    if (inner.type !== "job action") {
      return; // TODO
    }
    const jobUUID = action.streamName;
    const job = state.jobs.get(jobUUID);
    const { jobAction, timestamp } = inner;
    switch (jobAction.type) {
      case "upsert job":
        state.jobs.set(jobUUID, {
          uuid: jobUUID,
          number: action.streamNumber,
          status: job?.status ?? "triaged",
          archived: job?.archived ?? false,
          timestamps: {
            creation: job?.timestamps.creation ?? inner.timestamp,
            working: job?.timestamps.working,
            completed: job?.timestamps.completed,
            cancelled: job?.timestamps.cancelled,
            hasComplexMovement: job?.timestamps.hasComplexMovement ?? false,
          },
          blocked: job?.blocked ?? false,
          ...pick(jobAction, ["customerName", "customerPhoneNumber", "description", "images"]),
        });
        break;
      case "change job status":
        if (job !== undefined && job.status !== jobAction.status) {
          switch (jobAction.status) {
            case "working":
              job.timestamps.working = job.timestamps.working ?? timestamp;
              if (job.status !== "triaged") job.timestamps.hasComplexMovement = true;
              break;
            case "complete":
              job.timestamps.completed = job.timestamps.completed ?? timestamp;
              if (job.status !== "working") job.timestamps.hasComplexMovement = true;
              break;
            case "cancelled":
              job.timestamps.cancelled = job.timestamps.cancelled ?? timestamp;
              if (job.status === "complete") {
                job.timestamps.hasComplexMovement = true;
              }
              break;
          }
          job.status = jobAction.status;
        }
        break;
      case "delete job":
        state.jobs.delete(jobUUID);
        break;
      case "set job archived":
        if (job !== undefined) {
          job.archived = jobAction.archived;
        }
        break;
      case "set job blocked":
        if (job !== undefined) {
          job.blocked = jobAction.blocked;
        }
        break;
      default:
        assertNever(jobAction);
    }
  });
}
