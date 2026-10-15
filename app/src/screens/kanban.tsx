import { useContext } from "react";
import { ImageBlob } from "../components/blob-loader.tsx";
import { TimeAgo } from "../components/time-ago.tsx";
import { AppContext } from "../context.ts";
import type { Job } from "../session-state/state.ts";
import { jobDetail } from "../navigation-state.ts";

export function Kanban() {
  return (
    <div className="m-2">
      <div className="row g-2 h-100">
        <Column title="Triaged" statuses={["triaged"]} />
        <Column title="Working" statuses={["working"]} />
        <Column title="Done" statuses={["complete", "cancelled"]} />
      </div>
    </div>
  );
}

function Column(props: { title: string; statuses: Job["status"][] }) {
  const { session, navigate } = useContext(AppContext);
  const jobs = Array.from(session?.state.jobs.values() ?? []).filter((job) =>
    props.statuses.includes(job.status),
  );
  return (
    <div className="col-12 col-lg-4 fs-5">
      <div className="bg-body p-3 shadow-sm rounded">
        <div className="border-bottom mb-3">
          <h3>
            {props.title} ({jobs.length})
          </h3>
        </div>
        {jobs.map((job) => (
          <a
            key={job.uuid}
            href="#"
            className="plain-link"
            onClick={(e) => {
              e.preventDefault();
              navigate(jobDetail(job.uuid));
            }}
          >
            <div className="row gx-2 mx-1 mb-2 border rounded overflow-hidden">
              <div className="col-4 ps-0">
                {job.images.length > 0 && (
                  <ImageBlob blobId={job.images[0]!.blobId} type={job.images[0]!.type} />
                )}
              </div>
              <div className="col d-flex flex-column">
                <div className="mt-1 mb-0 d-flex">
                  <div className="flex-grow-1">
                    <h4>{job.customerName}</h4>
                  </div>
                  <div>
                    <h4>#{job.number}</h4>
                  </div>
                </div>
                {job.tags.size !== 0 && (
                  <div className="d-flex flex-wrap gap-1 fs-6">
                    {Array.from(job.tags).map((tag) => (
                      <div
                        key={tag}
                        className="kanban-tag px-2 bg-info-subtle text-info-emphasis rounded-pill"
                      >
                        {tag}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-1 flex-grow-1">
                  <div className="h-100 job-description">
                    {job.description.replace(/\n/g, " | ")}
                  </div>
                </div>
                <div className="text-secondary text-end mt-1 kanban-timestamp">
                  <TimeAgo time={job.timestamps.creation} />
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
