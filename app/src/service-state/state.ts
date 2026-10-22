import type { allStatuses, Image } from "./action.ts";

export type State = {
  processedJobActions: Set<string>;
  jobs: Map<string, Job>;
  pendingJobNumbers: Map<string, number>;
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
    hasComplexMovement: boolean;
  };
};

export const initialState: State = {
  processedJobActions: new Set(),
  jobs: new Map(),
  pendingJobNumbers: new Map(),
};
