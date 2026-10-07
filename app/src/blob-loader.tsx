import { useContext, useEffect, useState, type ReactNode } from "react";
import { AppContext } from "./context.ts";

export function Spinner() {
  return (
    <div className="spinner-border" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
  );
}

export function BlobLoader(props: {
  blobId: string;
  loading: ReactNode;
  notFound: ReactNode;
  onError?: (e: unknown) => void;
  loaded: (data: Uint8Array<ArrayBuffer>) => ReactNode;
}) {
  const { store } = useContext(AppContext);
  const [state, setState] = useState<"loading" | "error" | "not found" | Uint8Array<ArrayBuffer>>(
    "loading",
  );
  useEffect(() => {
    store
      .getBlob(props.blobId)
      .then((data) => setState(data ?? "not found"))
      .catch((err) => props.onError?.(err));
  }, [store, props.blobId]);
  switch (state) {
    case "loading":
      return props.loading;
    case "error":
    case "not found":
      return props.notFound;
    default:
      return props.loaded(state);
  }
}
