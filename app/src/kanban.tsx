import type { Job, State } from "./state/state.ts";
// @ts-expect-error
import "./kanban.css";

export function Kanban(props: { state: State }) {
  return (
    <div className="row bg-body-secondary vh-100 p-3">
      <Column title="Triaged" jobs={props.state.filter(({ status }) => status === "triaged")} />
      <Column title="Working" jobs={props.state.filter(({ status }) => status === "working")} />
      <Column title="Complete" jobs={props.state.filter(({ status }) => status === "complete")} />
    </div>
  );
}

function Column(props: { title: string; jobs: Job[] }) {
  return (
    <div className="col d-flex flex-column m-2 p-3 bg-body shadow-sm rounded">
      <div className="border-bottom mb-3">
        <h4>{props.title}</h4>
      </div>
      <div className="overflow-y-scroll">
        {props.jobs.map((job, idx) => (
          <div
            className="row gx-2 mx-1 mb-2 border rounded overflow-hidden"
            key={idx}
            style={{ height: "8rem" }}
          >
            <div className="col-6 ps-0 h-100">
              {job.images.length > 0 && (
                <img
                  src={`data:${job.images[0]!.type};base64,${job.images[0]!.data.toBase64()}`}
                  className="img-fluid h-100 w-100 object-fit-cover"
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
    </div>
  );
}
