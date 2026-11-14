import type { Job } from "../service-state/state.ts";
import { ImageBlob } from "./blob-loader.tsx";
import { ImageNotFound } from "./image-not-found.tsx";

export function Thumbnail({ job }: { job: Job }) {
  const image = job.images[0];
  if (image === undefined) {
    return <ImageNotFound />;
  }
  const { thumbnail } = image;
  if (thumbnail === undefined) {
    return <ImageNotFound />;
  } else {
    return <ImageBlob jobUUID={job.uuid} blobUUID={thumbnail.blobId} type={thumbnail.type} />;
  }
}
