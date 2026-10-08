import "./styles.scss";
import {
  StrictMode,
  useEffect,
  useMemo,
  useReducer,
  useState,
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
import { AppContext, type WithLoading } from "./context.ts";
import { SessionManager } from "./session.tsx";
import { ApiClient } from "@biko-jobs/api-client";

window.onload = () => {
  const store = new Store("/api");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App store={store} />
    </StrictMode>,
  );
};

function App({ store }: { store: Store }) {
  const [localState, dispatchLocal] = useReducer(reducer, initialLocalState);
  const withLoading: WithLoading =
    (p) =>
      (...args) => {
        dispatchLocal({ type: "set loading" });
        // TODO error surfacing
        p(...args)?.finally(() => dispatchLocal({ type: "done loading" }));
      };
  const state = useSyncExternalStore(store.subscribe.bind(store), store.getSnapshot.bind(store));
  const kanbanScreen = useMemo(() => <Kanban />, [state, dispatchLocal]);
  const refresh = withLoading(() => store?.refreshState());
  useEffect(() => refresh(), []);
  let screen: ReactNode;
  switch (localState.screen.type) {
    case "session manager":
      screen = <SessionManager />;
      break;
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
    <AppContext
      value={{
        state,
        store,
        localState,
        dispatchLocal,
        withLoading,
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
