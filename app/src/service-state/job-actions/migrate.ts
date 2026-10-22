import type { AnyVersionJobAction, JobAction } from "../action.ts";
import { migrateFromV1 } from "./v2.ts";

export function migrateAction(action: AnyVersionJobAction): JobAction {
  if (!("version" in action)) {
    return migrateFromV1(action);
  }
  return action;
}
