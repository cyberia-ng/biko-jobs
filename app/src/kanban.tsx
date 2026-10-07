import type { Job } from "./state/state.ts";
import "./kanban.css";
import { BlobLoader, Spinner } from "./blob-loader.tsx";
import { useContext } from "react";
import { AppContext } from "./context.ts";

export function Kanban() {
  return (
    <div className="row g-0 h-100 p-2">
      <Column title="Triaged" status="triaged" />
      <Column title="Working" status="working" />
      <Column title="Complete" status="complete" />
    </div>
  );
}

function Column(props: { title: string; status: Job["status"] }) {
  const { state, dispatchLocal } = useContext(AppContext);
  const jobs = state.jobs.filter((job) => job.status === props.status);
  function viewDetail(jobNumber: number) {
    dispatchLocal({ type: "view job detail", jobNumber });
  }
  return (
    <div className="col m-2 p-3 bg-body shadow-sm rounded">
      <div className="border-bottom mb-3">
        <h4>{props.title}</h4>
      </div>
      {jobs.map((job) => (
        <a
          key={job.number}
          href="#"
          className="plain-link"
          onClick={(e) => {
            e.preventDefault();
            viewDetail(job.number);
          }}
        >
          <div
            className="row gx-2 mx-1 mb-2 border rounded overflow-hidden"
            style={{ height: "8rem" }}
          >
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
            <div className="col">
              <div className="">
                <h5 className="mb-1 mt-1">{job.customerName}</h5>
              </div>
              <div className="job-description">{job.description.replace(/\n/g, " | ")}</div>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
