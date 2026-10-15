import { useContext, useState } from "react";
import { AppContext } from "../context.ts";
import { ImageBlob } from "../components/blob-loader.tsx";
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalConfirmButton,
  ModalDismissButton,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "../components/modal.tsx";
import { Tags } from "../components/tag-control.tsx";
import { TimeAgo } from "../components/time-ago.tsx";
import {
  addJobTag,
  allStatuses,
  changeJobStatus,
  deleteJob,
  removeJobTag,
} from "../session-state/action.ts";
import type { Job } from "../session-state/state.ts";
import { basicScreen, editJob } from "../navigation-state.ts";

type ModalState = null | "delete job";

export function JobDetail() {
  const { session, navigationState, navigate } = useContext(AppContext);
  const [modalState, setModalState] = useState<ModalState>(null);
  if (navigationState.screen !== "job detail") {
    return <></>;
  }
  const uuid = navigationState.uuid;
  const job = session?.state.jobs.get(uuid);
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
            session?.dispatch(deleteJob({ uuid }));
            navigate(basicScreen("kanban"));
          }}
        >
          <ModalHeader>
            <ModalTitle>Confirm deletion</ModalTitle>
            <ModalCloseButton />
          </ModalHeader>
          <ModalBody>Really delete this job?</ModalBody>
          <ModalFooter>
            <ModalDismissButton>Cancel</ModalDismissButton>
            <ModalConfirmButton className="btn btn-danger">Delete</ModalConfirmButton>
          </ModalFooter>
        </Modal>
      )}
      <div className="m-2 row">
        <div className="col-12 col-md-6 bg-white rounded shadow-sm p-2 fs-5">
          <div className="mb-4">
            <div className="d-flex">
              <div className="flex-grow-1">
                <button
                  className="btn btn-primary fs-4 me-2"
                  onClick={() => navigate(basicScreen("kanban"))}
                >
                  <i className="bi bi-caret-left-fill" />
                  Back
                </button>
              </div>
              <button
                className="btn btn-secondary me-2 fs-4"
                onClick={() => navigate(editJob(uuid))}
              >
                <i className="bi bi-pencil me-2" />
                Edit job
              </button>
              <button className="btn btn-danger fs-4" onClick={() => setModalState("delete job")}>
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
              <h3>#{job.number}</h3>
            </div>
          </div>
          {job.customerPhoneNumber !== "" && <div className="mb-1">{job.customerPhoneNumber}</div>}
          <div className="text-secondary">
            {job.timestamps.creation.toLocaleString()} (<TimeAgo time={job.timestamps.creation} />)
          </div>
          <hr />
          <div>
            <Status job={job} />
          </div>
          <hr />
          <div className="job-detail-tags">
            <Tags
              tags={job.tags}
              onAddTag={(tag) => session?.dispatch(addJobTag({ uuid: job.uuid, tag }))}
              onDeleteTag={(tag) => session?.dispatch(removeJobTag({ uuid: job.uuid, tag }))}
              dropdownClassAll="fs-4"
            />
          </div>
          <hr />
          <div style={{ whiteSpace: "pre-wrap" }}>{job.description}</div>
        </div>
        <div className="col-12 col-md-6 border-start">
          {job.images.map((image) => (
            <div key={image.blobId} className="mb-2 bg-white p-2 rounded shadow-sm">
              <ImageBlob blobId={image.blobId} type={image.type} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Status(props: { job: Job }) {
  const { session } = useContext(AppContext);
  return (
    <select
      value={props.job.status}
      className="form-select fs-4 bg-primary-subtle"
      onChange={(e) => {
        if (e.target.value === props.job.status) {
          return;
        }
        session?.dispatch(
          changeJobStatus({
            uuid: props.job.uuid,
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
    case "cancelled":
      return "Cancelled";
  }
}
