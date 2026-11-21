import { useContext, useEffect, useState } from "react";
import { AppContext } from "../context.ts";
import { ImageNotFound } from "./image-not-found.tsx";

export function Spinner() {
  return (
    <div className="spinner-border" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
  );
}

export function ImageBlob({
  jobUUID,
  blobUUID,
  type,
}: {
  jobUUID: string;
  blobUUID: string;
  type: string;
}) {
  const { getBlob } = useContext(AppContext);
  const [state, setState] = useState<
    { type: "loading" | "not found" } | { type: "loaded"; url: string }
  >({ type: "loading" });
  useEffect(() => {
    getBlob(jobUUID, blobUUID)
      .then((data) => {
        if (data === undefined) {
          setState({ type: "not found" });
        } else {
          const blob = new Blob([data], { type });
          const url = URL.createObjectURL(blob);
          setState({ type: "loaded", url });
        }
      })
      .catch(console.error);
  }, [getBlob, jobUUID, blobUUID, type]);
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
    case "not found":
      return <ImageNotFound />;
    default:
      return <img src={state.url} className="img-fluid h-100 w-100 object-fit-cover" />;
  }
}
