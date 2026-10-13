import { BlobLoader, Spinner } from "./blob-loader.tsx";
import { useContext } from "react";
import { AppContext } from "./context.ts";
import { TimeAgo } from "./time-ago.tsx";
import type { Job } from "./session-state/action.ts";

export function Kanban() {
  return (
    <div className="m-2">
      <div className="row g-2 h-100">
        <Column title="Triaged" status="triaged" />
        <Column title="Working" status="working" />
        <Column title="Complete" status="complete" />
      </div>
    </div>
  );
}

function Column(props: { title: string; status: Job["status"] }) {
  const { session, dispatchLocal } = useContext(AppContext);
  const jobs = Array.from(session?.state.jobs.values() ?? []).filter(
    (job) => job.status === props.status,
  );
  function viewDetail(uuid: string) {
    dispatchLocal({ type: "view job detail", uuid });
  }
  return (
    <div className="col-12 col-sm-4">
      <div className="bg-body p-3 shadow-sm rounded">
        <div className="border-bottom mb-3">
          <h3>{props.title}</h3>
        </div>
        {jobs.map((job) => (
          <a
            key={job.uuid}
            href="#"
            className="plain-link"
            onClick={(e) => {
              e.preventDefault();
              viewDetail(job.uuid);
            }}
          >
            <div className="row gx-2 mx-1 mb-2 border rounded overflow-hidden">
              <div className="col-4 ps-0">
                {job.images.length > 0 && (
                  <BlobLoader
                    blobId={job.images[0]!.blobId}
                    loading={
                      <div className="h-100 position-relative">
                        <div className="position-absolute top-50 start-50 translate-middle">
                          <Spinner />
                        </div>
                      </div>
                    }
                    notFound=":("
                    loaded={(data) => (
                      <img
                        src={`data:${job.images[0]!.type};base64,${data.toBase64()}`}
                        className="img-fluid h-100 w-100 object-fit-cover"
                      />
                    )}
                  />
                )}
              </div>
              <div className="col d-flex flex-column">
                <div className="my-1 d-flex">
                  <div className="flex-grow-1">
                    <h4>{job.customerName}</h4>
                  </div>
                  <div>
                    <h4>#{job.number}</h4>
                  </div>
                </div>
                <div className="flex-grow-1">
                  <div className="h-100 job-description fs-5">
                    {job.description.replace(/\n/g, " | ")}
                  </div>
                </div>
                <div className="text-secondary text-end mt-1 kanban-timestamp">
                  <TimeAgo time={job.creation} />
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
