import type { Action, allStatuses, Image } from "./action.ts";

export type State = {
  processedActions: {
    ids: Set<string>;
    list: Action[];
  };
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
    hasComplexMovement: boolean;
  };
};

export const initialState: State = {
  processedActions: {
    ids: new Set(),
    list: [],
  },
  jobs: new Map(),
  nextJobNumber: 1,
};
