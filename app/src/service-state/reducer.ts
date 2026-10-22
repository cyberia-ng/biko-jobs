import { produce } from "immer";
import type { Action, JobAction } from "./action.ts";
import type { State } from "./state.ts";
import pick from "lodash/pick.js";
import { assertNever } from "../assertNever.ts";

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "job action":
      return reduceJobAction(state, action.action);
    case "create job": {
      return produce(state, (state) => {
        state.pendingJobNumbers.set(action.uuid, action.number);
      });
    }
  }
}

function reduceJobAction(state: State, action: JobAction): State {
  return produce(state, (state) => {
    if (state.processedJobActions.has(action.uuid)) {
      return;
    }
    state.processedJobActions.add(action.uuid);
    const { event } = action;
    switch (event.type) {
      case "upsert job":
        const existing = state.jobs.get(event.uuid);
        const jobNumber = state.pendingJobNumbers.get(event.uuid) ?? existing?.number;
        state.pendingJobNumbers.delete(event.uuid);
        if (jobNumber === undefined) {
          return state;
        }
        state.jobs.set(event.uuid, {
          uuid: event.uuid,
          number: jobNumber,
          status: existing?.status ?? "triaged",
          timestamps: {
            creation: existing?.timestamps.creation ?? action.timestamp,
            working: existing?.timestamps.working,
            completed: existing?.timestamps.completed,
            cancelled: existing?.timestamps.cancelled,
            hasComplexMovement: existing?.timestamps.hasComplexMovement ?? false,
          },
          ...pick(event, ["customerName", "customerPhoneNumber", "description", "tags", "images"]),
        });
        break;
      case "add job tag":
        state.jobs.get(event.uuid)?.tags.add(event.tag);
        break;
      case "remove job tag":
        state.jobs.get(event.uuid)?.tags.delete(event.tag);
        break;
      case "change job status":
        const job = state.jobs.get(event.uuid);
        if (job !== undefined && job.status !== event.status) {
          switch (event.status) {
            case "working":
              job.timestamps.working = job.timestamps.working ?? action.timestamp;
              if (job.status !== "triaged") job.timestamps.hasComplexMovement = true;
              break;
            case "complete":
              job.timestamps.completed = job.timestamps.completed ?? action.timestamp;
              if (job.status !== "working") job.timestamps.hasComplexMovement = true;
              break;
            case "cancelled":
              job.timestamps.cancelled = job.timestamps.cancelled ?? action.timestamp;
              if (job.status === "complete") {
                job.timestamps.hasComplexMovement = true;
              }
              break;
          }
          job.status = event.status;
        }
        break;
      case "delete job":
        state.jobs.delete(event.uuid);
        break;
      default:
        assertNever(event);
    }
  });
}
