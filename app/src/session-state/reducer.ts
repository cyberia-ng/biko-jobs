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
      case "upsert job":
        const existing = state.jobs.get(event.uuid);
        state.jobs.set(event.uuid, {
          uuid: event.uuid,
          number: existing?.number ?? state.nextJobNumber,
          status: "triaged",
          creation: existing?.creation ?? action.timestamp,
          ...pick(event, ["customerName", "customerPhoneNumber", "description", "tags", "images"]),
        });
        if (existing === undefined) state.nextJobNumber++;
        break;
      case "add job tag":
        state.jobs.get(event.uuid)?.tags.add(event.tag);
        break;
      case "remove job tag":
        state.jobs.get(event.uuid)?.tags.delete(event.tag);
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
      default:
        assertNever(event);
    }
  });
}
