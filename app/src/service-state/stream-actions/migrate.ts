import type { AnyVersionStreamAction, StreamAction } from "../action.ts";
import { migrateFromV1 } from "./v2.ts";
import { migrateFromV2 } from "./v3.ts";

export function migrateAction(action: AnyVersionStreamAction): StreamAction[] {
  return [action]
    .flatMap((action) => {
      if (!("version" in action)) return migrateFromV1(action);
      else return [action];
    })
    .flatMap((action) => {
      if (action.version === 2) return migrateFromV2(action);
      else return [action];
    });
}
