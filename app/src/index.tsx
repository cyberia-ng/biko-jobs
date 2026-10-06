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
    <div className="vh-100 d-flex flex-column flex-sm-row">
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
      <div className="flex-grow-1 vh-100 overflow-scroll">
        <div className={localState.screen !== "kanban" ? "d-none" : "h-100"}>
          <Kanban state={state} />
        </div>
        <div className={localState.screen !== "new job" ? "d-none" : "h-100"}>
          <NewJob
            onSubmit={(job) => {
              dispatchLocal({ type: "set loading" });
              props.store
                .postAction({ type: "new job", ...job })
                .then(() => dispatchLocal({ type: "done loading" }))
                .catch(() => dispatchLocal({ type: "done loading" }));
            }}
          />
        </div>
      </div>
    </div>
  );
}
