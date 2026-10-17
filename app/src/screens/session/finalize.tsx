import { useContext, useMemo, useState } from "react";
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalConfirmButton,
  ModalDismissButton,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "../../components/modal.tsx";
import { AppContext } from "../../context.ts";
import { Spinner } from "../../components/blob-loader.tsx";
import type { Action } from "../../session-state/action.ts";
import { TimeAgo } from "../../components/time-ago.tsx";

export function Finalize({ session, onDismiss }: { session: string; onDismiss: () => void }) {
  const { session: sessionData } = useContext(AppContext);
  const numJobs = sessionData?.state.jobs.size ?? 0;
  const numImages = useMemo(() => {
    let numImages = 0;
    for (const job of sessionData?.state.jobs.values() ?? []) {
      numImages += job.images.length;
    }
    return numImages;
  }, [sessionData]);
  const [finalizing, setFinalizing] = useState<"waiting" | "in progress" | "done" | "failed">(
    "waiting",
  );
  function finalize() {
    if (sessionData === undefined) {
      console.error("session data was unexpectedly undefined");
      setFinalizing("failed");
      return;
    }
    setFinalizing("in progress");
    sessionData
      .finalize([])
      .then(() => setFinalizing("done"))
      .catch(() => setFinalizing("failed"));
  }

  return (
    <Modal onDismiss={onDismiss} onConfirm={() => finalize()} className="fs-5">
      <ModalHeader>
        <ModalTitle>
          <h4>Finalize session {session}</h4>
        </ModalTitle>
        <ModalCloseButton />
      </ModalHeader>
      <ModalBody>
        <p>
          <Modified actions={sessionData?.state.processedActions.list ?? []} />
        </p>
        <p>
          It contains {sayNumber(numJobs, "job")} and {sayNumber(numImages, "image")}.
        </p>
        <p>
          Finalizing it will remove the customer name and phone number from all jobs, delete all
          images, and prevent any further changes to the session.
        </p>
        <p>Do you want to proceed?</p>
        {finalizing === "in progress" && (
          <div className="text-center">
            <Spinner />
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {(finalizing === "waiting" || finalizing === "in progress") && (
          <ModalConfirmButton className="btn btn-danger" disabled={finalizing === "in progress"}>
            Finalize
          </ModalConfirmButton>
        )}
        {finalizing === "done" && (
          <ModalDismissButton className="btn btn-success">Done</ModalDismissButton>
        )}
        <ModalDismissButton>Cancel</ModalDismissButton>
      </ModalFooter>
    </Modal>
  );
}

function sayNumber(value: number, singular: string, plural?: string) {
  if (value === 1) {
    return `${value.toString(10)} ${singular}`;
  } else {
    return `${value.toString(10)} ${plural ?? singular + "s"}`;
  }
}

function Modified({ actions }: { actions: Action[] }) {
  switch (actions.length) {
    case 0:
      return <>This session is empty.</>;
    case 1: {
      const action = actions[0]!;
      return (
        <>
          This session was created <TimeAgo time={action.timestamp} />.
        </>
      );
    }
    default: {
      const first = actions[0]!;
      const last = actions[actions.length - 1]!;
      return (
        <>
          This session was created <TimeAgo time={first.timestamp} /> and last modified{" "}
          <TimeAgo time={last.timestamp} />.
        </>
      );
    }
  }
}
