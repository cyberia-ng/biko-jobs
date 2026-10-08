import { useContext, useReducer, useRef, useState } from "react";
import { BlobLoader, Spinner } from "./blob-loader.tsx";
import { AppContext } from "./context.ts";
import type { Job } from "./state/state.ts";

export function EditJob(props: { new_?: boolean }) {
  const isNew = props.new_ ?? false;
  const { store, state, localState, withLoading, dispatchLocal } = useContext(AppContext);
  let job: Job | undefined = undefined;
  if (!isNew) {
    job = state?.jobs.find(
      (job) => localState.screen.type === "edit job" && job.number === localState.screen.jobNumber,
    );
    if (job === undefined) {
      console.error("Editing non-existent job");
    }
  }

  const [customerName, setCustomerName] = useState<string>(job?.customerName ?? "");
  const [description, setDescription] = useState<string>(job?.description ?? "");
  type Photos = Array<{ blobId: string; uploaded: boolean }>;
  type PhotosAction =
    | { type: "start upload"; blobId: string }
    | { type: "complete upload"; blobId: string }
    | { type: "delete"; blobId: string }
    | { type: "reset" };
  const [photos, reducePhotos] = useReducer<Photos, [PhotosAction]>(
    (photos, action) => {
      switch (action.type) {
        case "start upload":
          return [...photos, { blobId: action.blobId, uploaded: false }];
        case "complete upload":
          return photos.map((photo) =>
            photo.blobId !== action.blobId ? photo : { ...photo, uploaded: true },
          );
        case "delete":
          return photos.filter((photo) => photo.blobId !== action.blobId);
        case "reset":
          return [];
      }
    },
    job?.images.map((image) => ({ blobId: image.blobId, uploaded: true })) ?? [],
  );
  const photoInputRef = useRef<HTMLInputElement>(null);
  function reset() {
    setCustomerName("");
    setDescription("");
    reducePhotos({ type: "reset" });
    if (photoInputRef.current !== null) {
      photoInputRef.current.value = "";
    }
  }
  async function submit() {
    const images = photos.map(({ blobId }) => ({ type: "image/jpeg", blobId }));
    if (isNew) {
      await store?.postAction({
        type: "new job",
        customerName,
        description,
        images,
      });
      reset();
    } else if (job !== undefined) {
      await store?.postAction({
        type: "edit job",
        jobNumber: job.number,
        customerName,
        description,
        images,
      });
      dispatchLocal({ type: "view job detail", jobNumber: job.number });
    }
  }

  return (
    <div className="bg-white m-2 p-2 rounded shadow-sm">
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
        <div className="row mb-3">
          {photos.map(({ blobId, uploaded }) => (
            <div className="row mb-3" key={blobId}>
              {uploaded ? (
                <BlobLoader
                  blobId={blobId}
                  notFound=""
                  loaded={(data) => (
                    <img
                      src={`data:image/jpeg;base64,${data.toBase64()}`}
                      className="object-fit-cover col-8"
                    />
                  )}
                  loading={
                    <div className="col-8 position-relative">
                      <div className="position-absolute top-50 start-50 translate-middle">
                        <Spinner />
                      </div>
                    </div>
                  }
                />
              ) : (
                <div className="col-8 position-relative">
                  <div className="position-absolute top-50 start-50 translate-middle">
                    <Spinner />
                  </div>
                </div>
              )}
              <div className="col-4 d-flex">
                <button
                  className="btn btn-danger align-self-center"
                  onClick={() => reducePhotos({ type: "delete", blobId })}
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
            ref={photoInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) {
                const id = crypto.randomUUID();
                reducePhotos({ type: "start upload", blobId: id });
                file
                  .bytes()
                  .then((data) => {
                    e.target.value = "";
                    return data;
                  })
                  .then((data) => store?.writeBlob(id, data))
                  .then(() => reducePhotos({ type: "complete upload", blobId: id }));
              }
            }}
          />
        </div>
        <div className="mb-3">
          <button className="btn btn-primary me-3" onClick={withLoading(() => submit())}>
            {isNew ? "Submit" : "Save"}
          </button>
          {isNew && (
            <button className="btn btn-danger" onClick={reset}>
              Reset
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
