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
import {
  allStatuses,
  changeJobStatus,
  deleteJob,
  setJobBlocked,
  type Status,
} from "../service-state/action.ts";
import type { Job } from "../service-state/state.ts";
import { basicScreen, editJob } from "../navigation-state.ts";

export function JobDetail() {
  const { service, navigationState, navigate } = useContext(AppContext);
  if (navigationState.screen !== "job detail") {
    return <></>;
  }
  const job_ = service?.state.jobs.get(navigationState.uuid);
  if (job_ === undefined) {
    return <></>;
  }
  const job = job_;
  function onBlock(reason: string) {
    service.dispatch(setJobBlocked(reason), job.uuid);
  }
  function onUnblock() {
    service.dispatch(setJobBlocked(false), job.uuid);
  }
  function onBack() {
    navigate(basicScreen("kanban"));
  }
  function onDelete() {
    service.dispatch(deleteJob(), job.uuid);
    navigate(basicScreen("kanban"));
  }
  function onEdit() {
    navigate(editJob(job.uuid));
  }
  function onStatusChange(status: Status) {
    service.dispatch(changeJobStatus(status), job.uuid);
  }
  return (
    <JobDetailInner
      job={job_}
      onBack={onBack}
      onEdit={onEdit}
      onDelete={onDelete}
      onBlock={onBlock}
      onUnblock={onUnblock}
      onStatusChange={onStatusChange}
    />
  );
}

function JobDetailInner({
  job,
  onBack,
  onEdit,
  onDelete,
  onBlock,
  onUnblock,
  onStatusChange,
}: {
  job: Job;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onBlock: (reason: string) => void;
  onUnblock: () => void;
  onStatusChange: (status: Status) => void;
}) {
  return (
    <div className="fs-4">
      <div className="m-2 row">
        <div className="col-12 col-md-6 bg-white rounded shadow-sm p-2">
          <TopButtons onBack={onBack} onEdit={onEdit} onDelete={onDelete} />
          <hr />
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
          <Status job={job} onChange={onStatusChange} />
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

function TopButtons({
  onBack,
  onEdit,
  onDelete,
}: {
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [modalState, setModalState] = useState<null | "delete job">(null);
  return (
    <div className="d-flex">
      {modalState === "delete job" && (
        <Modal
          onDismiss={() => setModalState(null)}
          onConfirm={() => {
            setModalState(null);
            onDelete();
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
      <div className="flex-grow-1">
        <button className="btn btn-primary fs-4 me-2" onClick={() => onBack()}>
          <i className="bi bi-caret-left-fill" />
          Back
        </button>
      </div>
      <button className="btn btn-secondary me-2 fs-4" onClick={() => onEdit()}>
        <i className="bi bi-pencil me-2" />
        Edit job
      </button>
      <button className="btn btn-danger fs-4" onClick={() => setModalState("delete job")}>
        <i className="bi bi-trash me-1" />
        Delete job
      </button>
    </div>
  );
}

function Status({ job, onChange }: { job: Job; onChange: (status: Status) => void }) {
  return (
    <div>
      <select
        value={job.status}
        className="form-select fs-4 bg-primary-subtle"
        onChange={(e) => {
          if (e.target.value !== job.status) onChange(e.target.value as Status);
        }}
      >
        {allStatuses.map((status) => (
          <option key={status} value={status}>
            {statusText(status)}
          </option>
        ))}
      </select>
    </div>
  );
}

function statusText(status: Status): string {
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
