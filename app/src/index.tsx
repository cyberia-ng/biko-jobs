// import "bootstrap/dist/css/bootstrap.min.css";
import "./styles.scss";
import {
  StrictMode,
  useContext,
  useMemo,
  useReducer,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { Kanban } from "./kanban.tsx";
import { Store } from "./store.ts";
import { Nav } from "./nav.tsx";
import { initialState, reducer } from "./local-state.ts";
import { EditJob } from "./edit-job.tsx";
import { JobDetail } from "./job-detail.tsx";
import { AppContext, type AppContextT } from "./context.ts";

window.onload = () => {
  Store.init(`http://${window.location.host}/api`, "some-session", "some-password").then(
    (store) => {
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <App store={store}>
            <Main />
          </App>
        </StrictMode>,
      );
    },
  );
};

function App(props: { store: Store; children?: ReactNode | ReactNode[] }) {
  const state = useSyncExternalStore(
    props.store.subscribe.bind(props.store),
    props.store.getSnapshot.bind(props.store),
  );
  const [localState, dispatchLocal] = useReducer(reducer, initialState);
  const context = useMemo<AppContextT>(
    () => ({
      state,
      store: props.store,
      localState,
      dispatchLocal,
      withLoading:
        (p) =>
          (...args) => {
            dispatchLocal({ type: "set loading" });
            p(...args).finally(() => dispatchLocal({ type: "done loading" }));
          },
    }),
    [state, props.store, localState, dispatchLocal],
  );
  return <AppContext value={context}>{props.children}</AppContext>;
}

function Main() {
  const ctx = useContext(AppContext);
  const kanbanScreen = useMemo(() => <Kanban />, [ctx.state, ctx.dispatchLocal]);
  let screen: ReactNode;
  switch (ctx.localState.screen.type) {
    case "kanban":
      screen = kanbanScreen;
      break;
    case "new job":
      screen = <EditJob new_ />;
      break;
    case "job detail":
      screen = <JobDetail />;
      break;
    case "edit job":
      screen = <EditJob />;
      break;
  }
  return (
    <div className="vh-100 d-flex flex-column flex-sm-row">
      <div>
        <Nav />
      </div>
      <div className="flex-grow-1 vh-100 overflow-scroll">{screen}</div>
    </div>
  );
}
