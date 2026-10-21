import { useContext, useEffect, useState } from "react";
import { AppContext } from "../context.ts";

export function Spinner() {
  return (
    <div className="spinner-border" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
  );
}

export function ImageBlob(props: {
  jobUUID: string;
  blobUUID: string;
  type: string;
  onError?: (e: unknown) => void;
}) {
  const { service: session } = useContext(AppContext);
  const [state, setState] = useState<
    { type: "loading" | "error" | "not found" } | { type: "loaded"; url: string }
  >({ type: "loading" });
  useEffect(() => {
    session
      ?.getBlob(props.blobUUID, props.jobUUID)
      .then((data) => {
        if (data === undefined) {
          setState({ type: "not found" });
        } else {
          const blob = new Blob([data], { type: props.type });
          const url = URL.createObjectURL(blob);
          setState({ type: "loaded", url });
        }
      })
      .catch((err) => {
        setState({ type: "error" });
        props.onError?.(err);
      });
  }, [session, props]);
  useEffect(
    () => () => {
      if (state.type === "loaded") URL.revokeObjectURL(state.url);
    },
    [state],
  );
  switch (state.type) {
    case "loading":
      return (
        <div className="h-100 d-flex">
          <div className="m-auto">
            <Spinner />
          </div>
        </div>
      );
    case "error":
    case "not found":
      return (
        <div className="h-100 d-flex">
          <i className="bi bi-file-earmark-x fs-1 m-auto" />
        </div>
      );
    default:
      return <img src={state.url} className="img-fluid h-100 w-100 object-fit-cover" />;
  }
}
