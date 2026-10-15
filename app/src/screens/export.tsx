import { useContext } from "react";
import { AppContext } from "../context.ts";
import { unparse } from "papaparse";

export function Export() {
  const { session, loginState } = useContext(AppContext);
  const sessionId = loginState?.session;
  function generatePseudonymised() {
    const jobs = Array.from(
      session?.state.jobs.values().map(({ uuid, number, description, status, timestamps }) => ({
        uuid,
        number,
        description,
        status,
        creation: timestamps.creation.toString(),
        working: timestamps.working?.toString(),
        completed: timestamps.completed?.toString(),
        cancelled: timestamps.cancelled?.toString(),
      })) ?? [],
    );
    const csvStr = unparse(jobs);
    const csv = new TextEncoder().encode(csvStr);
    return csv;
  }
  return (
    <div className="bg-white m-2 p-2 rounded shadow-sm fs-4">
      <div
        className="d-grid align-items-center gap-3"
        style={{
          gridTemplateColumns: "minmax(auto, max-content) auto",
        }}
      >
        <ExportRow
          text="Export pseudonymised CSV"
          generate={generatePseudonymised}
          filename={(sessionId ?? "") + ".pseudonymised.csv"}
        />
      </div>
    </div>
  );
}

function ExportRow({
  text,
  filename,
  generate,
}: {
  text: string;
  filename: string;
  generate: () => Uint8Array<ArrayBuffer>;
}) {
  function download() {
    const blob = new Blob([generate()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link); //TODO necessary?
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div>{text}</div>
      <div>
        <button type="button" className="btn btn-primary fs-4" onClick={download}>
          Export
        </button>
      </div>
    </>
  );
}
