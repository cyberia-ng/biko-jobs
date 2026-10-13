import "./styles.scss";
import "temporal-polyfill/global";
import {
  StrictMode,
  useCallback,
  useEffect,
  useReducer,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { Kanban } from "./kanban.tsx";
import { Nav } from "./nav.tsx";
import { initialLocalState, reducer } from "./local-state.ts";
import { EditJob } from "./edit-job.tsx";
import { JobDetail } from "./job-detail.tsx";
import { AppContext, type AppContextT } from "./context.ts";
import { SessionManager } from "./session.tsx";
import { Store } from "./session-state/store.ts";
import { ApiClient } from "@biko-jobs/api-client";

window.onload = () => {
  if (import.meta.env.MODE !== "production") {
    if (import.meta.env.MODE === "development") {
      document.title = document.title + " (dev)";
    } else {
      document.title = document.title + ` (${import.meta.env.MODE})`;
    }
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

function App() {
  const [localState, dispatchLocal] = useReducer(reducer, initialLocalState(window.location.hash));
  const withLoading = useCallback(
    (description: string, p: Promise<void> | undefined) => {
      if (p === undefined) return;
      const id = crypto.randomUUID();
      dispatchLocal({ type: "set loading", id });
      p.catch((e: unknown) => console.error("loading promise rejection", description, e)); // TODO error surfacing
      p.finally(() => dispatchLocal({ type: "done loading", id }));
    },
    [dispatchLocal],
  );

  const [sessionStore, setSessionStore] = useState<Store | undefined>(undefined);
  const sessionState = useSyncExternalStore(
    useCallback(
      (cb) => (sessionStore === undefined ? () => () => undefined : sessionStore.subscribe(cb)),
      [sessionStore],
    ),
    useCallback(
      () => (sessionStore === undefined ? undefined : sessionStore.getSnapshot()),
      [sessionStore],
    ),
  );
  const refreshSessionState = useCallback(
    () => withLoading("refreshing session state", sessionStore?.refreshState()),
    [sessionStore, withLoading],
  );

  const [sessionsList, setSessionsList] = useState<string[]>([]);
  const refreshSessionsList = useCallback(
    () =>
      withLoading("refreshing session list", ApiClient.listSessions("/api").then(setSessionsList)),
    [withLoading],
  );
  const refresh = useCallback(() => {
    refreshSessionsList();
    refreshSessionState();
  }, [refreshSessionState, refreshSessionsList]);

  useEffect(() => {
    if (localState.currentSession === undefined) {
      return;
    }
    if (window.localStorage.getItem(`session passwords/${localState.currentSession}`) === null) {
      window.localStorage.setItem(
        `session passwords/${localState.currentSession.session}`,
        localState.currentSession.password,
      );
    }
    withLoading(
      `connecting to session: ${localState.currentSession.session}`,
      Store.connect(localState.currentSession.session, localState.currentSession.password).then(
        setSessionStore,
      ),
    );
  }, [localState.currentSession, withLoading]);
  useEffect(() => () => sessionStore?.cleanup(), [sessionStore]);
  useEffect(() => refreshSessionsList(), [refreshSessionsList]);

  const context: AppContextT = {
    sessionsList,
    session:
      sessionState === undefined || sessionStore === undefined
        ? undefined
        : {
            state: sessionState,
            dispatch: (action) =>
              withLoading(`posting event: ${action.event.type}`, sessionStore.postEvent(action)),
            getBlob: sessionStore.getBlob.bind(sessionStore),
            writeBlob: (id, data) =>
              withLoading(`writing blob: ${id}`, sessionStore.writeBlob(id, data)),
          },
    localState,
    dispatchLocal,
    refresh,
  };

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
    <AppContext value={context}>
      <div className="vh-100 d-flex flex-column flex-sm-row">
        <div>
          <Nav />
        </div>
        <div className="flex-grow-1 vh-100 overflow-scroll">{screen}</div>
      </div>
    </AppContext>
  );
}
