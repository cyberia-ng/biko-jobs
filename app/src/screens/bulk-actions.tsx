import { useContext, useState } from "react";
import { Page } from "../components/page.tsx";
import { AppContext } from "../context.ts";
import type { Job } from "../service-state/persistent/state.ts";
import { unparse } from "papaparse";
import { changeJobStatus, type StreamAction } from "../service-state/persistent/action.ts";
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
import { streamAction } from "../service-state/reducer.ts";

export function BulkActions() {
  const { state, dispatch: dispatchOuter } = useContext(AppContext);
  const jobs = Array.from(state.persistent.jobs.values());
  function dispatch(action: StreamAction, jobUUID: string) {
    dispatchOuter(streamAction(jobUUID, action));
  }
  return (
    <Page>
      <div
        className="d-grid align-items-center gap-3"
        style={{
          gridTemplateColumns: "minmax(auto, max-content) auto",
        }}
      >
        <Export jobs={jobs} />
        <CancelRemainingTriagedJobs jobs={jobs} dispatch={dispatch} />
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
