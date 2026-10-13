export type ActionV1 = {
  timestamp: Temporal.Instant;
  event: NewJob | ChangeJobStatus | DeleteJob | EditJob;
};

export type JobV1 = {
  uuid: string;
  number: number;
  customerName: string;
  customerPhoneNumber: string;
  description: string;
  status: (typeof allStatusesV1)[number];
  images: Image[];
  creation: Temporal.Instant;
};
export const allStatusesV1 = ["triaged", "working", "complete"] as const;

type Image = {
  type: string;
  blobId: string;
};

type NewJob = {
  type: "new job";
  uuid: string;
  customerName: string;
  customerPhoneNumber?: string;
  description: string;
  images: Image[];
};

type ChangeJobStatus = {
  type: "change job status";
  uuid: string;
  status: JobV1["status"];
};

type DeleteJob = {
  type: "delete job";
  uuid: string;
};

type EditJob = {
  type: "edit job";
  uuid: string;
  customerName: string;
  customerPhoneNumber?: string;
  description: string;
  images: Image[];
};
