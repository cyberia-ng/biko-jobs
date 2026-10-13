import type { Action, AnyVersionAction } from "../action.ts";
import { migrateFromV1 } from "./v2.ts";

export function migrateAction(action: AnyVersionAction): Action {
  if (!("version" in action)) {
    return migrateFromV1(action);
  } else {
    return action;
  }
}
