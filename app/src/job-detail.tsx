import { useContext, useState } from "react";
import { AppContext } from "./context.ts";
import { BlobLoader, Spinner } from "./blob-loader.tsx";
import { allStatuses, type Job } from "./state/state.ts";
import { Modal } from "./modal.tsx";

type ModalState = null | "delete job";

export function JobDetail() {
  const {
    state,
    localState,
    dispatchLocal,
    store,
    withLoading: withLoading2,
  } = useContext(AppContext);
  const [modalState, setModalState] = useState<ModalState>(null);
  if (localState.screen.type !== "job detail") {
    return <></>;
  }
  const jobNumber = localState.screen.jobNumber;
  const job = state?.session?.jobs.find((job) => job.number === jobNumber);
  if (job === undefined) {
    return <></>;
  }
  return (
    <>
      {modalState === "delete job" && (
        <Modal
          onDismiss={() => setModalState(null)}
          onConfirm={() => {
            setModalState(null);
            withLoading2(
              store
                ?.postAction({ type: "delete job", jobNumber })
                .then(() => dispatchLocal({ type: "navigate", screen: "kanban" })),
            );
          }}
          title="Confirm deletion"
          body="Really delete this job?"
          confirmText="Delete"
          closeText="Cancel"
          confirmBtnClass="btn-danger"
        />
      )}
      <div className="m-2 row">
        <div className="col-12 col-md-6 bg-white rounded shadow-sm p-2 fs-5">
          <div className="mb-4">
            <div className="d-flex">
              <div className="flex-grow-1">
                <button
                  className="btn btn-primary"
                  onClick={() => dispatchLocal({ type: "navigate", screen: "kanban" })}
                >
                  <i className="bi bi-caret-left-fill" />
                  Back
                </button>
              </div>
              <button
                className="btn btn-secondary me-2"
                onClick={() => dispatchLocal({ type: "edit job", jobNumber })}
              >
                <i className="bi bi-pencil me-2" />
                Edit job
              </button>
              <button className="btn btn-danger" onClick={() => setModalState("delete job")}>
                <i className="bi bi-trash me-1" />
                Delete job
              </button>
            </div>
          </div>
          <div className="d-flex">
            <div className="flex-grow-1">
              <h3>{job.customerName}</h3>
            </div>
            <div>
              <h3>#{jobNumber}</h3>
            </div>
          </div>
          <hr />
          <div>
            <Status job={job} />
          </div>
          <hr />
          <div style={{ whiteSpace: "pre-wrap" }}>{job.description}</div>
        </div>
        <div className="col-12 col-md-6 border-start">
          {job.images.map((image) => (
            <div key={image.blobId} className="mb-2 bg-white p-2 rounded shadow-sm">
              <BlobLoader
                blobId={image.blobId}
                loading={<Spinner />}
                notFound=""
                loaded={(data) => (
                  <img
                    src={`data:${job.images[0]!.type};base64,${data.toBase64()}`}
                    className="img-fluid h-100 w-100 object-fit-cover rounded"
                  />
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Status(props: { job: Job }) {
  const { store, withLoading: withLoading2 } = useContext(AppContext);
  return (
    <select
      value={props.job.status}
      className="form-select fs-4 bg-primary-subtle"
      onChange={(e) => {
        if (e.target.value === props.job.status) {
          return;
        }
        withLoading2(
          store?.postAction({
            type: "change job status",
            jobNumber: props.job.number,
            status: e.target.value as Job["status"],
          }),
        );
      }}
    >
      {allStatuses.map((status) => (
        <option key={status} value={status}>
          {statusText(status)}
        </option>
      ))}
    </select>
  );
}

function statusText(status: Job["status"]): string {
  switch (status) {
    case "triaged":
      return "Triaged";
    case "working":
      return "Working";
    case "complete":
      return "Complete";
  }
}
