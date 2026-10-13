export type ActionV1 = {
  timestamp: Temporal.Instant;
  event: NewJobV1 | ChangeJobStatusV1 | DeleteJobV1 | EditJobV1;
};

export type JobV1 = {
  uuid: string;
  number: number;
  customerName: string;
  customerPhoneNumber: string;
  description: string;
  status: (typeof allStatusesV1)[number];
  images: ImageV1[];
  creation: Temporal.Instant;
};
export const allStatusesV1 = ["triaged", "working", "complete"] as const;

export type ImageV1 = {
  type: string;
  blobId: string;
};

export type NewJobV1 = {
  type: "new job";
  uuid: string;
  customerName: string;
  customerPhoneNumber: string;
  description: string;
  images: ImageV1[];
};

export type ChangeJobStatusV1 = {
  type: "change job status";
  uuid: string;
  status: JobV1["status"];
};

export type DeleteJobV1 = {
  type: "delete job";
  uuid: string;
};

export type EditJobV1 = {
  type: "edit job";
  uuid: string;
  customerName: string;
  customerPhoneNumber: string;
  description: string;
  images: ImageV1[];
};
