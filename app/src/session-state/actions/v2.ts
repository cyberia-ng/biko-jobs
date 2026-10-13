import { allStatusesV1, type ActionV1, type JobV1 } from "./v1.ts";

export type ActionV2 = ActionV1 & {
  version: 2;
  uuid: string;
};

export type JobV2 = JobV1;

export const allStatusesV2 = allStatusesV1;

export function migrateFromV1(action: ActionV1): ActionV2 {
  // Non-deterministic
  return {
    ...action,
    version: 2,
    uuid: crypto.randomUUID(),
  };
}
