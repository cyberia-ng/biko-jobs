export type State = {
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
  images: Image[];
  creation: Temporal.Instant;
};
export type Image = {
  type: string;
  blobId: string;
};

export const initialState: State = { jobs: new Map(), nextJobNumber: 1 };
export const allStatuses = ["triaged", "working", "complete"] as const;
