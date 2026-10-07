// import "bootstrap/dist/css/bootstrap.min.css";
import "./styles.scss";
import {
  createContext,
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
import { initialState, reducer, type Action, type LocalState } from "./local-state.ts";
import { NewJob } from "./new-job.tsx";
import { JobDetail } from "./job-detail.tsx";
import type { State } from "./state/state.ts";

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

export type WithLoading = <Args extends unknown[]>(
  p: (...args: Args) => Promise<void>,
) => (...args: Args) => void;
type AppContextT = {
  state: State;
  store: Store;
  localState: LocalState;
  dispatchLocal: (action: Action) => void;
  withLoading: WithLoading;
};
export const AppContext = createContext<AppContextT>(null as any);

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
  const kanbanScreen = useMemo(() => <Kanban />, [ctx]);
  const newJobScreen = useMemo(() => <NewJob />, [ctx]);
  return (
    <div className="vh-100 d-flex flex-column flex-sm-row">
      <div>
        <Nav />
      </div>
      <div className="flex-grow-1 vh-100 overflow-scroll">
        <div className={ctx.localState.screen !== "kanban" ? "d-none" : "h-100"}>
          {kanbanScreen}
        </div>
        <div className={ctx.localState.screen !== "new job" ? "d-none" : "h-100"}>
          {newJobScreen}
        </div>
        <div className={ctx.localState.screen !== "job detail" ? "d-none" : "h-100"}>
          <JobDetail />
        </div>
      </div>
    </div>
  );
}
