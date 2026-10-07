export type State = Job[];
export type Job = {
  customerName: string;
  description: string;
  status: "triaged" | "working" | "complete";
  images: Image[];
};
export type Image = {
  type: string;
  blobId: string,
};
