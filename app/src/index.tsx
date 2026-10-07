// import "bootstrap/dist/css/bootstrap.min.css";
import "./styles.scss";
import { StrictMode, useMemo, useReducer, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Kanban } from "./kanban.tsx";
import { Store } from "./store.ts";
import { Nav } from "./nav.tsx";
import { initialState, reducer } from "./local-state.ts";
import { NewJob } from "./new-job.tsx";

window.onload = () => {
  Store.init(`http://${window.location.host}/api`, "some-session", "some-password").then(
    (store) => {
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <App store={store} />
        </StrictMode>,
      );
    },
  );
};

export type WithLoading = <Args extends unknown[]>(
  p: (...args: Args) => Promise<void>,
) => (...args: Args) => void;
function App(props: { store: Store }) {
  const state = useSyncExternalStore(
    props.store.subscribe.bind(props.store),
    props.store.getSnapshot.bind(props.store),
  );
  const [localState, dispatchLocal] = useReducer(reducer, initialState);
  const withLoading: WithLoading = useMemo(
    () =>
      (p) =>
        (...args) => {
          dispatchLocal({ type: "set loading" });
          p(...args).finally(() => dispatchLocal({ type: "done loading" }));
        },
    [dispatchLocal],
  );
  const kanbanScreen = useMemo(
    () => <Kanban state={state} store={props.store} withLoading={withLoading} />,
    [state, props.store, withLoading],
  );
  const newJobScreen = useMemo(
    () => <NewJob state={state} store={props.store} withLoading={withLoading} />,
    [state, props.store, withLoading],
  );
  return (
    <div className="vh-100 d-flex flex-column flex-sm-row">
      <div>
        <Nav
          localState={localState}
          refresh={withLoading(() => props.store.refreshState())}
          navigate={(screen) => dispatchLocal({ type: "navigate", screen })}
        />
      </div>
      <div className="flex-grow-1 vh-100 overflow-scroll">
        <div className={localState.screen !== "kanban" ? "d-none" : "h-100"}>{kanbanScreen}</div>
        <div className={localState.screen !== "new job" ? "d-none" : "h-100"}>{newJobScreen}</div>
      </div>
    </div>
  );
}
