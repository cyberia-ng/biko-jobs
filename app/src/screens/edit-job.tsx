import { useContext, useReducer, useState, type ReactNode } from "react";
import { ImageBlob } from "../components/blob-loader.tsx";
import { AppContext } from "../context.ts";
import { upsertJob, type Action, type Image } from "../service-state/action.ts";
import { Tags } from "../components/tag-control.tsx";
import type { Job } from "../service-state/state.ts";
import omit from "lodash/omit.js";
import { jobDetail } from "../navigation-state.ts";

type JobAction = Omit<Extract<Action["event"], { type: "upsert job" }>, "type" | "images"> & {
  images: PhotosT;
};

export function EditJob(props: { new_?: boolean }) {
  const isNew = props.new_ ?? false;
  const { service: service_, navigate, navigationState } = useContext(AppContext);
  const [loading, setLoading] = useState<boolean | Error>(false);
  if (service_ === undefined) {
    return <>not connected</>;
  }
  const service = service_;
  function submit(jobAction: JobAction) {
    (async () => {
      setLoading(true);
      if (isNew) {
        await service.createJob(jobAction.uuid);
      }
      const images: Image[] = [];
      for (const photo of jobAction.images) {
        switch (photo.type) {
          case "new":
            const blobUUID = crypto.randomUUID();
            const data = await photo.blob.bytes();
            await service.putBlob(blobUUID, jobAction.uuid, data);
            images.push({ type: "image/jpeg", blobId: blobUUID });
            break;
          case "existing":
            images.push(photo.image);
            break;
        }
      }
      const action: Action = upsertJob({ ...omit(jobAction, "images"), images });
      service.dispatch(action);
      setLoading(false);
    })().catch((e: Error) => setLoading(e));
  }
  let content: ReactNode;
  let job: Job | undefined = undefined;
  if (isNew) {
    content = <EditJobForm key={undefined} onSubmit={submit} disabled={loading === true} />;
  } else {
    if (navigationState.screen !== "edit job") {
      throw new Error("unreachable");
    }
    job = service.state.jobs.get(navigationState.uuid);
    if (job === undefined) {
      content = "Job does not exist";
    } else {
      content = (
        <EditJobForm key={job.uuid} job={job} onSubmit={submit} disabled={loading === true} />
      );
    }
  }
  return (
    <div className="bg-white m-2 p-2 rounded shadow-sm">
      {job !== undefined && (
        <div className="mb-2">
          <button className="btn btn-primary" onClick={() => navigate(jobDetail(job.uuid))}>
            <i className="bi bi-caret-left-fill" />
            Back
          </button>
        </div>
      )}
      {content}
    </div>
  );
}

function EditJobForm({
  job,
  onSubmit,
}: {
  job?: Job;
  onSubmit: (job: JobAction) => void;
  disabled: boolean;
}) {
  const [customerName, setCustomerName] = useState<string>(job?.customerName ?? "");
  const [customerPhoneNumber, setCustomerPhoneNumber] = useState<string>(
    job?.customerPhoneNumber ?? "",
  );
  const [description, setDescription] = useState<string>(job?.description ?? "");
  const [tags, dispatchTags] = useReducer(
    (tags: Set<string>, [add, tag]: [boolean, string]) =>
      add ? tags.union(new Set([tag])) : tags.difference(new Set([tag])),
    job?.tags ?? new Set(),
  );
  const [photos, setPhotos] = useState<PhotosT>(
    job?.images.map((image) => ({ type: "existing", image, job: job.uuid })) ?? [],
  );
  function reset() {
    setCustomerName("");
    setCustomerPhoneNumber("");
    setDescription("");
    setPhotos([]);
  }
  function submit() {
    const jobAction: JobAction = {
      uuid: job?.uuid ?? crypto.randomUUID(),
      tags,
      customerName,
      customerPhoneNumber,
      description,
      images: photos,
    };
    onSubmit(jobAction);
  }
  return (
    <div>
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="mb-3">
          <label htmlFor="customerName" className="form-label">
            Customer name
          </label>
          <input
            type="text"
            className="form-control"
            id="customerName"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>
        <div className="mb-3">
          <label htmlFor="customerPhoneNumber" className="form-label">
            Customer phone number
          </label>
          <input
            type="tel"
            className="form-control"
            id="customerPhoneNumber"
            value={customerPhoneNumber}
            onChange={(e) => setCustomerPhoneNumber(e.target.value)}
          />
        </div>
        <div className="mb-3">
          <label htmlFor="description" className="form-label">
            Job description
          </label>
          <textarea
            id="description"
            className="form-control"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="mb-3 edit-job-tags">
          <Tags
            tags={tags}
            onAddTag={(tag) => dispatchTags([true, tag])}
            onDeleteTag={(tag) => dispatchTags([false, tag])}
          />
        </div>
        <Photos photos={photos} onChange={setPhotos} />
        <div className="mb-3">
          <button type="submit" className="btn btn-primary me-3" onClick={() => submit()}>
            {job === undefined ? "Submit" : "Save"}
          </button>
          {job === undefined && (
            <button type="button" className="btn btn-danger" onClick={reset}>
              Reset
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

type Photo =
  | { type: "existing"; image: Image; job: string }
  | { type: "new"; uuid: string; blob: Blob; url: string };
type PhotosT = Array<Photo>;
function Photos({ photos, onChange }: { photos: PhotosT; onChange: (photos: PhotosT) => void }) {
  function deletePhoto(id: string) {
    const photo = photos.find((photo) => photoId(photo) === id);
    if (photo !== undefined) {
      if (photo.type === "new") {
        URL.revokeObjectURL(photo.url);
      }
      onChange(photos.filter((p) => p !== photo));
    }
  }
  function addPhoto(blob: Blob) {
    const uuid = crypto.randomUUID();
    const url = URL.createObjectURL(blob);
    onChange([...photos, { type: "new", uuid, blob, url }]);
  }
  function photoId(photo: Photo) {
    switch (photo.type) {
      case "new":
        return photo.uuid;
      case "existing":
        return photo.image.blobId;
    }
  }
  return (
    <>
      <div className="row mb-3">
        {photos.map((photo) => (
          <div className="row mb-3" key={photoId(photo)}>
            <div className="col-8">
              {photo.type === "new" ? (
                <img src={photo.url} className="img-fluid h-100 w-100 object-fit-cover" />
              ) : (
                <ImageBlob jobUUID={photo.job} blobUUID={photo.image.blobId} type="image/jpeg" />
              )}
            </div>
            <div className="col-4 d-flex">
              <button
                type="button"
                className="btn btn-danger align-self-center"
                onClick={() => deletePhoto(photoId(photo))}
              >
                <i className="bi bi-trash" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mb-3">
        <label htmlFor="photos" className="form-label">
          Attach photo
        </label>
        <input
          id="photos"
          multiple
          type="file"
          accept="image/jpeg"
          capture="environment"
          className="form-control"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file !== undefined) {
              addPhoto(file);
            }
          }}
        />
      </div>
    </>
  );
}
