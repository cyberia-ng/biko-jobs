import { produce } from "immer";
import type { Action } from "./action.ts";
import type { State } from "./state.ts";
import pick from "lodash/pick.js";
import { assertNever } from "../assertNever.ts";

export function reducer(state: State, action: Action): State {
  return produce(state, (state) => {
    if (state.processedActionIDs.has(action.uuid)) {
      return;
    }
    state.processedActionIDs.add(action.uuid);
    const { event } = action;
    switch (event.type) {
      case "new job":
        state.jobs.set(event.uuid, {
          uuid: event.uuid,
          number: state.nextJobNumber,
          status: "triaged",
          creation: action.timestamp,
          ...pick(event, ["customerName", "description", "images"]),
          customerPhoneNumber: event.customerPhoneNumber ?? "",
        });
        state.nextJobNumber++;
        break;
      case "change job status":
        const job = state.jobs.get(event.uuid);
        if (job !== undefined) {
          job.status = event.status;
        }
        break;
      case "delete job":
        state.jobs.delete(event.uuid);
        break;
      case "edit job": {
        const job = state.jobs.get(event.uuid);
        if (job !== undefined) {
          job.customerName = event.customerName;
          job.customerPhoneNumber = event.customerPhoneNumber ?? "";
          job.description = event.description;
          job.images = event.images;
        }
        break;
      }
      default:
        assertNever(event);
    }
  });
}
