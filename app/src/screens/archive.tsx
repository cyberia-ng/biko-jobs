import { useContext, useReducer, useState } from "react";
import { Page } from "../components/page.tsx";
import { AppContext } from "../context.ts";
import type { Job } from "../service-state/state.ts";
import { ImageBlob } from "../components/blob-loader.tsx";
import { produce } from "immer";
import { setJobArchived } from "../service-state/action.ts";
import partition from "lodash/partition.js";
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

export function Archive() {
  const {
    service: {
      state: { jobs },
      dispatch,
    },
  } = useContext(AppContext);
  const [archived, current] = partition(Array.from(jobs.values()), (job) => job.archived);
  return (
    <Page>
      <JobsDisplay
        jobs={current}
        title="Current jobs"
        verb="Archive"
        icon="archive"
        onAction={(jobs) => {
          for (const job of jobs) {
            dispatch(setJobArchived({ uuid: job.uuid, archived: true }));
          }
        }}
      />
      <hr />
      <JobsDisplay
        jobs={archived}
        title="Archived jobs"
        verb="Unarchive"
        icon="box-arrow-up"
        onAction={(jobs) => {
          for (const job of jobs) {
            dispatch(setJobArchived({ uuid: job.uuid, archived: false }));
          }
        }}
      />
    </Page>
  );
}

export function JobsDisplay({
  jobs,
  title,
  verb,
  icon,
  onAction,
}: {
  jobs: Job[];
  title: string;
  verb: string;
  icon: string;
  onAction: (jobs: Job[]) => void;
}) {
  const [selected, dispatchSelected] = useReducer(
    (s: Set<string>, a: { type: "toggle"; uuid: string } | { type: "all" } | { type: "none" }) =>
      produce(s, (selected) => {
        switch (a.type) {
          case "all":
            return new Set(jobs.map((job) => job.uuid));
          case "none":
            return new Set();
          case "toggle":
            if (selected.has(a.uuid)) selected.delete(a.uuid);
            else selected.add(a.uuid);
            break;
        }
      }),
    new Set(),
  );
  const toggleSelected = (uuid: string) => dispatchSelected({ type: "toggle", uuid });
  const selectAll = () => dispatchSelected({ type: "all" });
  const selectNone = () => dispatchSelected({ type: "none" });
  const [showModal, setShowModal] = useState(false);
  return (
    <>
      {showModal && (
        <Modal
          onDismiss={() => setShowModal(false)}
          onConfirm={() => {
            const selectedJobs = jobs.filter((job) => selected.has(job.uuid));
            onAction(selectedJobs);
            setShowModal(false);
          }}
        >
          <ModalHeader>
            <ModalTitle>Confirm {verb.toLowerCase()}</ModalTitle>
            <ModalCloseButton />
          </ModalHeader>
          <ModalBody>
            Really {verb.toLowerCase()} {selected.size} item(s)?
          </ModalBody>
          <ModalFooter>
            <ModalDismissButton>Cancel</ModalDismissButton>
            <ModalConfirmButton className="btn btn-danger">Confirm</ModalConfirmButton>
          </ModalFooter>
        </Modal>
      )}
      <div>
        <div className="d-flex align-items-center">
          <div className="flex-grow-1">{title}</div>
          <div className="ms-2 fs-5">
            <button type="button" className="btn btn-primary" onClick={() => selectAll()}>
              Select all
            </button>
          </div>
          <div className="ms-2 fs-5">
            <button type="button" className="btn btn-primary" onClick={() => selectNone()}>
              Select none
            </button>
          </div>
          <div className="ms-2 fs-5">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
              disabled={selected.size === 0}
            >
              <i className={`bi bi-${icon} me-2`} />
              {verb} selected
            </button>
          </div>
        </div>
        <hr />
        <div className="row">
          {jobs.map((job) => (
            <div key={job.uuid} className="col-12 col-md-4">
              <a
                href="#"
                className="plain-link"
                onClick={(e) => {
                  e.preventDefault();
                  toggleSelected(job.uuid);
                }}
              >
                <div className="border rounded overflow-hidden mb-2 position-relative">
                  <div className="position-absolute top-0 end-0 p-1 rounded rounded-top-0 rounded-end-0">
                    <input
                      type="checkbox"
                      className="form-check-input m-0"
                      checked={selected.has(job.uuid)}
                      onChange={() => toggleSelected(job.uuid)}
                    />
                  </div>
                  <div style={{ height: "10rem" }}>
                    {job.images.length > 0 && (
                      <ImageBlob
                        jobUUID={job.uuid}
                        blobUUID={job.images[0]!.blobId}
                        type={job.images[0]!.type}
                      />
                    )}
                  </div>
                  <div className="p-2">
                    <div>
                      #{job.number} {job.customerName}
                    </div>
                    <div className="fs-6">{job.description}</div>
                  </div>
                </div>
              </a>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
