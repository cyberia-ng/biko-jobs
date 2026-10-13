import { useContext, useEffect, useState } from "react";
import { AppContext } from "../context.ts";

export function Spinner() {
  return (
    <div className="spinner-border" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
  );
}

export function ImageBlob(props: { blobId: string; type: string; onError?: (e: unknown) => void }) {
  const { session } = useContext(AppContext);
  const [state, setState] = useState<"loading" | "error" | "not found" | Uint8Array<ArrayBuffer>>(
    "loading",
  );
  useEffect(() => {
    session
      ?.getBlob(props.blobId)
      .then((data) => setState(data ?? "not found"))
      .catch((err) => props.onError?.(err));
  }, [session, props]);
  switch (state) {
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
      return (
        <img
          src={`data:${props.type};base64,${state.toBase64()}`}
          className="img-fluid h-100 w-100 object-fit-cover"
        />
      );
  }
}
