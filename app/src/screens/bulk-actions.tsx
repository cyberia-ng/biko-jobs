import { useContext, useReducer, useState } from "react";
import { Page } from "../components/page.tsx";
import { AppContext } from "../context.ts";
import type { Job } from "../service-state/state.ts";
import { unparse } from "papaparse";
import { changeJobStatus, upsertJob, type StreamAction } from "../service-state/action.ts";
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
import type { Bytes } from "@biko-jobs/api-client";
import { makeThumbnail } from "../utilities/make-thumbnail.ts";
import { Spinner } from "../components/blob-loader.tsx";

export function BulkActions() {
  const { service } = useContext(AppContext);
  const jobs = Array.from(service.state.jobs.values());
  return (
    <Page>
      <div
        className="d-grid align-items-center gap-3"
        style={{
          gridTemplateColumns: "minmax(auto, max-content) auto",
        }}
      >
        <Export jobs={jobs} />
        <CancelRemainingTriagedJobs jobs={jobs} dispatch={service.dispatch} />
        <RegenerateThumbnails
          jobs={jobs}
          dispatch={service.dispatch}
          getBlob={service.getBlob}
          putBlob={service.putBlob}
        />
      </div>
    </Page>
  );
}

function Export({ jobs }: { jobs: Job[] }) {
  function generate() {
    const jobRows = Array.from(
      jobs.values().map(({ uuid, number, description, status, timestamps }) => ({
        uuid,
        number,
        description,
        status,
        creation: timestamps.creation.toString(),
        working: timestamps.working?.toString(),
        completed: timestamps.completed?.toString(),
        cancelled: timestamps.cancelled?.toString(),
        complexMovement: timestamps.hasComplexMovement,
      })) ?? [],
    );
    const csvStr = unparse(jobRows);
    const csv = new TextEncoder().encode(csvStr);
    return csv;
  }
  function download() {
    const blob = new Blob([generate()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "biko-jobs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div>Export anonymous job data</div>
      <div>
        <button type="button" className="btn btn-primary" onClick={download}>
          Export
        </button>
      </div>
    </>
  );
}

function CancelRemainingTriagedJobs({
  jobs,
  dispatch,
}: {
  jobs: Job[];
  dispatch: (action: StreamAction, jobUUID: string) => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const triagedJobUUIDs = jobs
    .filter((job) => job.archived === false && job.status === "triaged")
    .map((job) => job.uuid);
  function onConfirm() {
    for (const jobUUID of triagedJobUUIDs) {
      dispatch(changeJobStatus("cancelled"), jobUUID);
    }
    setShowConfirm(false);
  }
  return (
    <>
      <div>
        {showConfirm && (
          <Modal onDismiss={() => setShowConfirm(false)} onConfirm={onConfirm}>
            <ModalHeader>
              <ModalTitle>Cancel triaged jobs</ModalTitle>
              <ModalCloseButton />
            </ModalHeader>
            <ModalBody>
              This will change the status of {triagedJobUUIDs.length} job(s) from "triaged" to
              "cancelled".
            </ModalBody>
            <ModalFooter>
              <ModalConfirmButton className="btn btn-danger">Confirm</ModalConfirmButton>
              <ModalDismissButton>Abort</ModalDismissButton>
            </ModalFooter>
          </Modal>
        )}
        Cancel all "triaged" jobs
      </div>
      <div>
        <button type="button" className="btn btn-primary" onClick={() => setShowConfirm(true)}>
          Cancel
        </button>
      </div>
    </>
  );
}

function RegenerateThumbnails({
  jobs,
  dispatch,
  getBlob,
  putBlob,
}: {
  jobs: Job[];
  dispatch: (action: StreamAction, jobUUID: string) => void;
  getBlob: (blobUUID: string, jobUUID: string) => Promise<Bytes | undefined>;
  putBlob: (blobUUID: string, jobUUID: string, data: Bytes) => Promise<void>;
}) {
  const [modalState, setModalState] = useState<
    { type: "hidden" | "confirm" | "loading" } | { type: "error"; error: Error }
  >({ type: "hidden" });
  const [progress, dispatchProgress] = useReducer(
    (p, a: "increment" | "reset") => (a === "increment" ? p + 1 : 0),
    0,
  );
  const wouldRegenerateCount = jobs.filter((job) => job.images.length > 0).length;
  function onConfirm() {
    (async () => {
      setModalState({ type: "loading" });
      for (const job of jobs) {
        const [image, ...rest] = job.images;
        if (image === undefined) continue;
        const imageBytes = await getBlob(image.blobId, job.uuid);
        if (imageBytes === undefined) continue;
        const blob = new Blob([imageBytes], { type: image.type });
        const url = URL.createObjectURL(blob);
        const thumbnail = await makeThumbnail(url);
        const thumbnailBytes = await thumbnail.blob.bytes();
        const thumbnailUUID = crypto.randomUUID();
        await putBlob(thumbnailUUID, job.uuid, thumbnailBytes);
        dispatch(
          upsertJob({
            ...job,
            images: [
              { ...image, thumbnail: { type: "image/jpeg", blobId: thumbnailUUID } },
              ...rest,
            ],
          }),
          job.uuid,
        );
        dispatchProgress("increment");
      }
      setModalState({ type: "hidden" });
      dispatchProgress("reset");
    })().catch((error) => {
      setModalState({ type: "error", error });
      dispatchProgress("reset");
    });
  }
  return (
    <>
      <div>
        {modalState.type !== "hidden" && (
          <Modal onDismiss={() => setModalState({ type: "hidden" })} onConfirm={onConfirm}>
            <ModalHeader>
              <ModalTitle>Regenerate thumbnails</ModalTitle>
              <ModalCloseButton />
            </ModalHeader>
            <ModalBody>
              {modalState.type === "confirm" && <>Regenerate {wouldRegenerateCount} thumbnails?</>}
              {modalState.type === "loading" && (
                <div className="text-center">
                  <div>
                    <Spinner />
                  </div>
                  <div>
                    {progress} / {wouldRegenerateCount}
                  </div>
                </div>
              )}
              {modalState.type === "error" && (
                <div className="alert alert-danger">Error: {modalState.error.message}</div>
              )}
            </ModalBody>
            <ModalFooter>
              <ModalConfirmButton
                disabled={modalState.type === "loading" || modalState.type === "error"}
              >
                Confirm
              </ModalConfirmButton>
              <ModalDismissButton>Cancel</ModalDismissButton>
            </ModalFooter>
          </Modal>
        )}
        Regenerate job thumbnails
      </div>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setModalState({ type: "confirm" })}
        >
          Regenerate
        </button>
      </div>
    </>
  );
}
