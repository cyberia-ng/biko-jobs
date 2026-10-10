import "./styles.scss";
import {
  StrictMode,
  useCallback,
  useEffect,
  useReducer,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { Kanban } from "./kanban.tsx";
import { Store } from "./store.ts";
import { Nav } from "./nav.tsx";
import { initialLocalState, reducer } from "./local-state.ts";
import { EditJob } from "./edit-job.tsx";
import { JobDetail } from "./job-detail.tsx";
import { AppContext } from "./context.ts";
import { SessionManager } from "./session.tsx";

window.onload = () => {
  const store = new Store("/api");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App store={store} />
    </StrictMode>,
  );
};

function App({ store }: { store: Store }) {
  const [localState, dispatchLocal] = useReducer(reducer, initialLocalState(window.location.hash));
  const withLoading = useCallback(
    (p: Promise<void>) => {
      dispatchLocal({ type: "set loading" });
      p.finally(() => dispatchLocal({ type: "done loading" })); // TODO error surfacing
    },
    [dispatchLocal],
  );
  const state = useSyncExternalStore(
    useCallback((cb) => store.subscribe(cb), [store]),
    store.getSnapshot.bind(store),
  );
  const refresh = useCallback(() => withLoading(store.refreshState()), [store, withLoading]);
  useEffect(() => refresh(), [refresh]);
  useEffect(() => {
    const currentSession = localState.currentSession;
    if (currentSession !== undefined) {
      if (window.localStorage.getItem(`session passwords/${currentSession.session}`) === null) {
        window.localStorage.setItem(
          `session passwords/${currentSession.session}`,
          currentSession.password,
        );
      }
      withLoading(
        (async () => {
          await store.connect(currentSession.session, currentSession.password);
          await store.refreshState();
        })(),
      );
    }
  }, [localState.currentSession, store, withLoading]);
  let screen: ReactNode;
  switch (localState.screen.type) {
    case "session manager":
      screen = <SessionManager />;
      break;
    case "kanban":
      screen = <Kanban />;
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
    <AppContext
      value={{
        state,
        store,
        localState,
        dispatchLocal,
        withLoading: withLoading,
        refresh,
      }}
    >
      <div className="vh-100 d-flex flex-column flex-sm-row">
        <div>
          <Nav />
        </div>
        <div className="flex-grow-1 vh-100 overflow-scroll">{screen}</div>
      </div>
    </AppContext>
  );
}
