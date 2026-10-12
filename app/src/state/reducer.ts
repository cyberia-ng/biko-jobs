import { produce, enableMapSet } from "immer";
import type { Action } from "./action.ts";
import type { State } from "./state.ts";
import pick from "lodash/pick.js";
import { assertNever } from "../assertNever.ts";

enableMapSet();

export function reducer(state: State, action: Action): State {
  return produce(state, (state) => {
    switch (action.type) {
      case "reset session": {
        state.session = { jobs: new Map(), nextJobNumber: 1 };
        break;
      }
      case "update sessions list": {
        state.sessions = action.sessions;
        break;
      }
      case "event": {
        const { event } = action;
        switch (event.type) {
          case "new job":
            state.session?.jobs.set(event.uuid, {
              uuid: event.uuid,
              number: state.session.nextJobNumber,
              status: "triaged",
              creation: action.timestamp,
              ...pick(event, ["customerName", "description", "images"]),
            });
            if (state.session !== undefined) state.session.nextJobNumber++;
            break;
          case "change job status":
            const job = state.session?.jobs.get(event.uuid);
            if (job !== undefined) {
              job.status = event.status;
            }
            break;
          case "delete job":
            if (state.session === undefined) break;
            state.session.jobs.delete(event.uuid);
            break;
          case "edit job": {
            if (state.session === undefined) break;
            const job = state.session.jobs.get(event.uuid);
            if (job !== undefined) {
              job.customerName = event.customerName;
              job.description = event.description;
              job.images = event.images;
            }
            break;
          }
          default:
            assertNever(event);
        }
        break;
      }
      default:
        assertNever(action);
    }
  });
}
