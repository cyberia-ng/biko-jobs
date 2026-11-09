import type { AnyVersionStreamAction, StreamAction } from "../action.ts";
import { migrateFromV1 } from "./v2.ts";
import { migrateFromV2 } from "./v3.ts";

export function migrateAction(action: AnyVersionStreamAction): StreamAction {
  let out: AnyVersionStreamAction = action;
  if (!("version" in out)) {
    out = migrateFromV1(out);
  }
  if (out.version === 2) {
    out = migrateFromV2(out);
  }
  return out;
}
