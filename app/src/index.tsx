import "./styles.scss";
import "temporal-polyfill/global";
import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { Kanban } from "./screens/kanban.tsx";
import { Nav } from "./components/nav.tsx";
import {
  deserialize,
  initialState as initialNavigationState,
  serialize,
} from "./navigation-state.ts";
import { EditJob } from "./screens/edit-job.tsx";
import { JobDetail } from "./screens/job-detail.tsx";
import { AppContext, type AppContextT, type LoginState } from "./context.ts";
import { Store as SessionStore } from "./session-state/store.ts";
import { listSessions } from "@biko-jobs/api-client";
import { enableMapSet, produce } from "immer";
import { assertNever } from "./assertNever.ts";
import { Export } from "./screens/export.tsx";
import { useHashLocation } from "./use-hash-location.ts";
import type { State as NavigationState } from "./navigation-state.ts";
import { SessionManager } from "./screens/session/index.tsx";

enableMapSet();

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
  const [hash, navigateHash] = useHashLocation();
  const navigationState = useMemo(() => deserialize(hash) ?? initialNavigationState, [hash]);
  function navigate(state: NavigationState) {
    navigateHash(serialize(state));
  }
  const [loginState, setLoginState] = useState<LoginState>(undefined);

  const [loadingIds, dispatchLoading] = useReducer(
    (state: Set<string>, [add, id]: [boolean, string]) =>
      produce(state, (state) => {
        if (add) state.add(id);
        else state.delete(id);
      }),
    new Set(),
  );
  const withLoading = useCallback(
    (description: string, p: Promise<void> | undefined) => {
      if (p === undefined) return;
      const id = crypto.randomUUID();
      dispatchLoading([true, id]);
      p.catch((e: unknown) => console.error("loading promise rejection", description, e)); // TODO error surfacing
      p.finally(() => dispatchLoading([false, id]));
    },
    [dispatchLoading],
  );

  const [sessionStore, setSessionStore] = useState<SessionStore | undefined>(undefined);
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
  useEffect(() => () => sessionStore?.cleanup(), [sessionStore]);
  const refreshSessionState = useCallback(
    () => withLoading("refreshing session state", sessionStore?.refreshState()),
    [sessionStore, withLoading],
  );

  const [sessionsList, setSessionsList] = useState<string[]>([]);
  const refreshSessionsList = useCallback(
    () =>
      withLoading(
        "refreshing session list",
        listSessions("/api").then((s) => setSessionsList(s.map(({ session }) => session))),
      ),
    [withLoading],
  );
  const refresh = useCallback(() => {
    refreshSessionsList();
    refreshSessionState();
  }, [refreshSessionState, refreshSessionsList]);

  useEffect(() => {
    if (loginState === undefined) {
      return;
    }
    if (window.localStorage.getItem(`session passwords/${loginState.session}`) === null) {
      window.localStorage.setItem(`session passwords/${loginState.session}`, loginState.password);
    }
    withLoading(
      `connecting to session: ${loginState.session}`,
      SessionStore.connect(loginState.session, loginState.password)
        .then(setSessionStore)
        .then(refreshSessionsList),
    );
  }, [loginState, withLoading, refreshSessionsList]);
  useEffect(() => refreshSessionsList(), [refreshSessionsList]);

  const context: AppContextT = {
    sessionsList,
    loginState,
    setLoginState,
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
    loading: loadingIds.size !== 0,
    navigationState,
    navigate,
    refresh,
  };

  let screen: ReactNode;
  switch (navigationState.screen) {
    case "session manager":
      screen = <SessionManager key={JSON.stringify(loginState)} />;
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
    case "export":
      screen = <Export />;
      break;
    default:
      assertNever(navigationState);
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
