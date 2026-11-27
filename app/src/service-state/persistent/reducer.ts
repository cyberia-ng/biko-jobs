import { produce } from "immer";
import type { State } from "./state.ts";
import pick from "lodash/pick.js";
import type { StreamAction } from "./action.ts";
import type { StreamEvent } from "@biko-jobs/api-client";

export function reducer(state: State, event: StreamEvent<StreamAction>): State {
  return produce(state, (state) => {
    if (state.processedJobActions.has(event.uuid)) {
      return;
    }
    state.processedJobActions.add(event.uuid);
    const { data: action } = event;
    if (action.type !== "job action") {
      return; // TODO
    }
    const jobUUID = event.stream.name;
    const job = state.jobs.get(jobUUID);
    const { jobAction, timestamp } = action;
    switch (jobAction.type) {
      case "upsert job":
        state.jobs.set(jobUUID, {
          uuid: jobUUID,
          number: event.stream.number,
          status: job?.status ?? "triaged",
          archived: job?.archived ?? false,
          timestamps: {
            creation: job?.timestamps.creation ?? action.timestamp,
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
        jobAction satisfies never;
    }
  });
}
