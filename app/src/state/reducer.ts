import { produce } from "immer";
import type { Action } from "./action.ts";
import type { State } from "./state.ts";
import pick from "lodash/pick.js";
import { assertNever } from "../assertNever.ts";

export function reducer(state: State, action: Action): State {
  return produce(state, (state) => {
    switch (action.type) {
      case "reset session": {
        state.session = { jobs: [], nextJobNumber: 1 };
        break;
      }
      case "update sessions list": {
        state.sessions = action.sessions;
        break;
      }
      case "new job":
        state.session?.jobs.push({
          number: state.session.nextJobNumber,
          status: "triaged",
          ...pick(action, ["customerName", "description", "images"]),
        });
        if (state.session !== undefined) state.session.nextJobNumber++;
        break;
      case "change job status":
        const job = state.session?.jobs.find((job) => job.number === action.jobNumber);
        if (job !== undefined) {
          job.status = action.status;
        }
        break;
      case "delete job":
        if (state.session === undefined) break;
        state.session.jobs = state.session.jobs.filter((job) => job.number !== action.jobNumber);
        break;
      case "edit job": {
        if (state.session === undefined) break;
        const job = state.session.jobs.find((job) => job.number === action.jobNumber);
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
