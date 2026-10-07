import type { Job, State } from "./state/state.ts";
import "./kanban.css";
import type { WithLoading } from "./index.tsx";
import type { Store } from "./store.ts";
import { useEffect, useState, type ReactNode } from "react";
import { BlobLoader, Spinner } from "./blob-loader.tsx";

export function Kanban(props: { state: State; store: Store; withLoading: WithLoading }) {
  return (
    <div className="row g-0 h-100 p-2">
      <Column
        store={props.store}
        title="Triaged"
        jobs={props.state.filter(({ status }) => status === "triaged")}
      />
      <Column
        store={props.store}
        title="Working"
        jobs={props.state.filter(({ status }) => status === "working")}
      />
      <Column
        store={props.store}
        title="Complete"
        jobs={props.state.filter(({ status }) => status === "complete")}
      />
    </div>
  );
}

function Column(props: { title: string; jobs: Job[]; store: Store }) {
  return (
    <div className="col m-2 p-3 bg-body shadow-sm rounded">
      <div className="border-bottom mb-3">
        <h4>{props.title}</h4>
      </div>
      {props.jobs.map((job, idx) => (
        <div
          className="row gx-2 mx-1 mb-2 border rounded overflow-hidden"
          key={idx}
          style={{ height: "8rem" }}
        >
          <div className="col-4 ps-0">
            {job.images.length > 0 && (
              <BlobLoader
                store={props.store}
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
      ))}
    </div>
  );
}
