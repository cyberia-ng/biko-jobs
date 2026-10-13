import type { allStatuses, Image } from "./action.ts";

export type State = {
  processedActionIDs: Set<string>;
  jobs: Map<string, Job>;
  nextJobNumber: number;
};

export type Job = {
  uuid: string;
  number: number;
  customerName: string;
  customerPhoneNumber: string;
  description: string;
  status: (typeof allStatuses)[number];
  tags: Set<string>;
  images: Image[];
  timestamps: {
    creation: Temporal.Instant;
    working: Temporal.Instant | undefined;
    completed: Temporal.Instant | undefined;
    cancelled: Temporal.Instant | undefined;
  };
};

export const initialState: State = {
  processedActionIDs: new Set(),
  jobs: new Map(),
  nextJobNumber: 1,
};
