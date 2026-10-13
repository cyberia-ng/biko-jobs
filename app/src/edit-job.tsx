import { useContext, useReducer, useRef, useState, type ReactNode } from "react";
import { ImageBlob, Spinner } from "./blob-loader.tsx";
import { AppContext } from "./context.ts";
import { editJob, newJob, type Job } from "./session-state/action.ts";

export function EditJob(props: { new_?: boolean }) {
  const isNew = props.new_ ?? false;
  const { session, localState } = useContext(AppContext);
  let content: ReactNode;
  let job: Job | undefined = undefined;
  if (isNew) {
    content = <EditJobForm type="new job" key={undefined} />;
  } else {
    if (localState.screen.type !== "edit job") {
      throw new Error("unreachable");
    }
    if (session === undefined) {
      content = "Not connected";
    } else {
      job = session.state.jobs.get(localState.screen.uuid);
      if (job === undefined) {
        content = "Job does not exist";
      } else {
        content = <EditJobForm type="edit job" job={job} key={job.uuid} />;
      }
    }
  }
  return <div className="bg-white m-2 p-2 rounded shadow-sm">{content}</div>;
}

function EditJobForm(props: { type: "new job" } | { type: "edit job"; job: Job }) {
  const { session, dispatchLocal } = useContext(AppContext);
  const job = props.type === "edit job" ? props.job : undefined;

  const [customerName, setCustomerName] = useState<string>(job?.customerName ?? "");
  const [customerPhoneNumber, setCustomerPhoneNumber] = useState<string>(
    job?.customerPhoneNumber ?? "",
  );
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
    setCustomerPhoneNumber("");
    setDescription("");
    reducePhotos({ type: "reset" });
    if (photoInputRef.current !== null) {
      photoInputRef.current.value = "";
    }
  }
  function submit() {
    const images = photos.map(({ blobId }) => ({ type: "image/jpeg", blobId }));
    if (props.type === "new job") {
      session?.dispatch(
        newJob({
          uuid: crypto.randomUUID(),
          customerName,
          customerPhoneNumber,
          description,
          images,
        }),
      );
      reset();
    } else if (job !== undefined) {
      session?.dispatch(
        editJob({
          uuid: job.uuid,
          customerName,
          customerPhoneNumber,
          description,
          images,
        }),
      );
      dispatchLocal({ type: "view job detail", uuid: job.uuid });
    }
  }

  return (
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
      <div className="row mb-3">
        {photos.map(({ blobId, uploaded }) => (
          <div className="row mb-3" key={blobId}>
            <div className="col-8">
              {uploaded ? (
                <ImageBlob blobId={blobId} type="image/jpeg" />
              ) : (
                <div className="d-flex">
                  <div className="m-auto">
                    <Spinner />
                  </div>
                </div>
              )}
            </div>
            <div className="col-4 d-flex">
              <button
                type="button"
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
                .then((data) => session?.writeBlob(id, data))
                .then(() => reducePhotos({ type: "complete upload", blobId: id }));
            }
          }}
        />
      </div>
      <div className="mb-3">
        <button type="submit" className="btn btn-primary me-3" onClick={() => submit()}>
          {props.type === "new job" ? "Submit" : "Save"}
        </button>
        {props.type === "new job" && (
          <button type="button" className="btn btn-danger" onClick={reset}>
            Reset
          </button>
        )}
      </div>
    </form>
  );
}
