// @ts-expect-error
import "bootstrap/dist/css/bootstrap.min.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Kanban } from "./kanban.tsx";
import { newJob1, newJob2 } from "../test/data/actions.ts";
import { reducer } from "./state/reducer.ts";

window.onload = () => {
  Promise.all([newJob1(), newJob2()]).then(([newJob1, newJob2]) => {
    let state = reducer([], newJob1);
    state = reducer(state, newJob2);
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <Kanban state={state} />
      </StrictMode>,
    );
    console.log(state);
  });
};
