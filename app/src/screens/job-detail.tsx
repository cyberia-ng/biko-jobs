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
import { TimeAgo } from "../components/time-ago.tsx";
import { allStatuses, changeJobStatus, deleteJob, setJobBlocked } from "../service-state/action.ts";
import type { Job } from "../service-state/state.ts";
import { basicScreen, editJob } from "../navigation-state.ts";

export function JobDetail() {
  const { service: session, navigationState, navigate } = useContext(AppContext);
  const [deleteModalState, setDeleteModalState] = useState<null | "delete job">(null);
  if (navigationState.screen !== "job detail") {
    return <></>;
  }
  const uuid = navigationState.uuid;
  const job = session?.state.jobs.get(uuid);
  if (job === undefined) {
    return <></>;
  }
  function onBlock(reason: string) {
    session.dispatch(setJobBlocked(reason), uuid);
  }
  function onUnblock() {
    session.dispatch(setJobBlocked(false), uuid);
  }
  return (
    <div className="fs-4">
      {deleteModalState === "delete job" && (
        <Modal
          onDismiss={() => setDeleteModalState(null)}
          onConfirm={() => {
            setDeleteModalState(null);
            session?.dispatch(deleteJob(), uuid);
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
        <div className="col-12 col-md-6 bg-white rounded shadow-sm p-2">
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
              <button
                className="btn btn-danger fs-4"
                onClick={() => setDeleteModalState("delete job")}
              >
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
          <Block job={job} onBlock={onBlock} onUnblock={onUnblock} />
          <hr />
          <div style={{ whiteSpace: "pre-wrap" }}>{job.description}</div>
        </div>
        <div className="col-12 col-md-6 border-start">
          {job.images.map((image) => (
            <div key={image.blobId} className="mb-2 bg-white p-2 rounded shadow-sm">
              <ImageBlob jobUUID={job.uuid} blobUUID={image.blobId} type={image.type} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Status(props: { job: Job }) {
  const { service: session } = useContext(AppContext);
  return (
    <select
      value={props.job.status}
      className="form-select fs-4 bg-primary-subtle"
      onChange={(e) => {
        if (e.target.value === props.job.status) {
          return;
        }
        session?.dispatch(changeJobStatus(e.target.value as Job["status"]), props.job.uuid);
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

function Block({
  job,
  onBlock,
  onUnblock,
}: {
  job: Job;
  onBlock: (reason: string) => void;
  onUnblock: () => void;
}) {
  const [modalState, setModalState] = useState<null | "block" | "unblock">(null);
  const [blockReason, setBlockReason] = useState("");
  return (
    <div>
      {modalState === "block" && (
        <Modal
          onDismiss={() => setModalState(null)}
          onConfirm={() => {
            onBlock(blockReason);
            setModalState(null);
          }}
        >
          <ModalHeader>
            <ModalTitle>Blocking information</ModalTitle>
            <ModalCloseButton />
          </ModalHeader>
          <ModalBody>
            <p>Describe why the job is blocked, and where the bike is.</p>
            <p className="fs-5">
              <strong>Example:</strong> "waiting on parts (front wheel), bike in workshop labelled
              with job number, customer name and phone number"
            </p>
            <p>
              <textarea
                className="form-control"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </p>
          </ModalBody>
          <ModalFooter>
            <ModalConfirmButton disabled={blockReason === ""}>Confirm</ModalConfirmButton>
            <ModalDismissButton>Cancel</ModalDismissButton>
          </ModalFooter>
        </Modal>
      )}
      {modalState === "unblock" && (
        <Modal
          onDismiss={() => setModalState(null)}
          onConfirm={() => {
            onUnblock();
            setModalState(null);
          }}
        >
          <ModalHeader>
            <ModalTitle>Confirm</ModalTitle>
            <ModalCloseButton />
          </ModalHeader>
          <ModalBody>Really remove block on this job?</ModalBody>
          <ModalFooter>
            <ModalConfirmButton>Confirm</ModalConfirmButton>
            <ModalDismissButton>Cancel</ModalDismissButton>
          </ModalFooter>
        </Modal>
      )}
      {job.blocked === false && (
        <button type="button" className="btn btn-secondary" onClick={() => setModalState("block")}>
          Mark blocked
        </button>
      )}
      {job.blocked !== false && (
        <div className="bg-danger-subtle text-danger emphasis rounded p-3">
          <h4 className="fw-bold">Blocked</h4>
          {job.blocked.split("\n").map((line, idx) => (
            <p key={idx}>{line}</p>
          ))}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setModalState("unblock")}
          >
            Mark unblocked
          </button>
        </div>
      )}
    </div>
  );
}
