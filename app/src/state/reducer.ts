import { produce } from "immer";
import type { Action } from "./action.ts";
import type { State } from "./state.ts";
import pick from "lodash/pick.js";
import { assertNever } from "../assertNever.ts";

export function reducer(state: State, action: Action): State {
  return produce(state, (state) => {
    switch (action.type) {
      case "new job":
        state.jobs.push({
          number: state.nextJobNumber,
          status: "triaged",
          ...pick(action, ["customerName", "description", "images"]),
        });
        state.nextJobNumber++;
        break;
      case "change job status":
        const job = state.jobs.find((job) => job.number === action.jobNumber);
        if (job !== undefined) {
          job.status = action.status;
        }
        break;
      case "delete job":
        state.jobs = state.jobs.filter((job) => job.number !== action.jobNumber);
        break;
      case "edit job": {
        const job = state.jobs.find((job) => job.number === action.jobNumber);
        if (job !== undefined) {
          job.customerName = action.customerName;
          job.description = action.description;
          job.images = action.images;
        }
        break;
      }
      default:
        assertNever(action);
    }
  });
}
