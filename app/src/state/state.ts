export type State = {
  sessions: string[];
  currentSession?: string;
  session?: { jobs: Job[]; nextJobNumber: number };
};
export type Job = {
  number: number;
  customerName: string;
  description: string;
  status: (typeof allStatuses)[number];
  images: Image[];
};
export type Image = {
  type: string;
  blobId: string;
};

export const initialState: State = { sessions: [] };
export const allStatuses = ["triaged", "working", "complete"] as const;
