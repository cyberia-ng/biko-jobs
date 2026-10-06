// @ts-expect-error
import "bootstrap/dist/css/bootstrap.min.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Kanban } from "./kanban.tsx";

window.onload = () => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Kanban/>
    </StrictMode>,
  );
};
