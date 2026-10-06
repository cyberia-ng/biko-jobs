// import "bootstrap/dist/css/bootstrap.min.css";
import "./styles.scss";
import { StrictMode, useReducer, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Kanban } from "./kanban.tsx";
import { Store } from "./store.ts";
import { Nav } from "./nav.tsx";
import { initialState, reducer } from "./local-state.ts";
import { NewJob } from "./new-job.tsx";

window.onload = () => {
  Store.init("http://localhost:3000", "some-session", "some-password").then((store) => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App store={store} />
      </StrictMode>,
    );
  });
};

function App(props: { store: Store }) {
  const state = useSyncExternalStore(
    props.store.subscribe.bind(props.store),
    props.store.getSnapshot.bind(props.store),
  );
  const [localState, dispatchLocal] = useReducer(reducer, initialState);
  return (
    <div className="h-100 d-flex flex-column flex-sm-row bg-body-secondary">
      <div>
        <Nav
          localState={localState}
          refresh={() => {
            dispatchLocal({ type: "set loading" });
            props.store
              .refreshState()
              .then(() => dispatchLocal({ type: "done loading" }))
              .catch(() => dispatchLocal({ type: "done loading" }));
          }}
          navigate={(screen) => dispatchLocal({ type: "navigate", screen })}
        />
      </div>
      <div className="flex-grow-1">
        <div className={"h-100 " + (localState.screen !== "kanban" ? "d-none" : "")}>
          <Kanban state={state} />
        </div>
        <div className={"h-100 " + (localState.screen !== "new job" ? "d-none" : "")}>
          <NewJob localState={localState} dispatch={dispatchLocal} />
        </div>
      </div>
    </div>
  );
}
