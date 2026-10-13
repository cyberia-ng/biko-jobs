import type { Job } from "./action.ts";

export type State = {
  processedActionIDs: Set<string>;
  jobs: Map<string, Job>;
  nextJobNumber: number;
};

export const initialState: State = {
  processedActionIDs: new Set(),
  jobs: new Map(),
  nextJobNumber: 1,
};
