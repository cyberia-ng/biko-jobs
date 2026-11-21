import "./styles.scss";
import "temporal-polyfill/global";
import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { Kanban } from "./screens/kanban.tsx";
import { Nav } from "./components/nav.tsx";
import { EditJob } from "./screens/edit-job.tsx";
import { JobDetail } from "./screens/job-detail.tsx";
import { AppContext, type AppContextT } from "./context.ts";
import { Store as ServiceStore } from "./service-state/store.ts";
import { enableMapSet } from "immer";
import { assertNever } from "./utilities/assert-never.ts";
import { ApiClient } from "@biko-jobs/api-client";
import { Login } from "./screens/login.tsx";
import { Archive } from "./screens/archive.tsx";
import { makeEffector } from "./service-state/effects.ts";
import { useNavigation } from "./navigation/store.ts";
import { BulkActions } from "./screens/bulk-actions.tsx";
import { initialState } from "./service-state/state.ts";

enableMapSet();

window.onload = () => {
  if (import.meta.env.MODE !== "production") {
    if (import.meta.env.MODE === "development") {
      document.title = document.title + " (dev)";
    } else {
      document.title = document.title + ` (${import.meta.env.MODE})`;
    }
  }
  const apiClient = new ApiClient("/api");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App apiClient={apiClient} />
    </StrictMode>,
  );
};

function App({ apiClient }: { apiClient: ApiClient }) {
  const [navigationState, navigationStore] = useNavigation();

  const serviceStore = useMemo(() => {
    return new ServiceStore(
      makeEffector(apiClient),
      apiClient.getBlob.bind(apiClient),
      initialState,
    );
  }, [apiClient]);
  const state = useSyncExternalStore(
    useCallback((cb) => serviceStore.subscribe(cb), [serviceStore]),
    useCallback(() => serviceStore.getSnapshot(), [serviceStore]),
  );

  if (import.meta.env.DEV) {
    useEffect(() => {
      if (state.loginState.login.type !== "not logged in") return;
      if (navigationState.screen === "login" && navigationState.pairingRequestId !== undefined) {
        return;
      }
      if (state.loginState.masterKeys === "not loaded") return;
      const masterKey = state.loginState.masterKeys.find((mk) => mk.key.name === "some name");
      if (masterKey === undefined) return;
      serviceStore.dispatch({
        type: "login/begin password login flow",
        masterKey: masterKey.key,
        password: "some password",
      });
    }, [state, navigationState, serviceStore]);
  }

  const context: AppContextT = {
    state,
    dispatch: useMemo(() => serviceStore.dispatch.bind(serviceStore), [serviceStore]),
    getBlob: useMemo(() => serviceStore.getBlob.bind(serviceStore), [serviceStore]),
    navigationState,
    navigate: (state) => navigationStore.navigate(state),
    addNavigationHook: (hook) => navigationStore.addHook(hook),
  };

  let screen: ReactNode;
  switch (navigationState.screen) {
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
    case "login":
      screen = <Login />;
      break;
    case "archive":
      screen = <Archive />;
      break;
    case "bulk actions":
      screen = <BulkActions />;
      break;
    default:
      assertNever(navigationState);
  }
  return (
    <AppContext value={context}>
      <div className="d-flex flex-column flex-sm-row">
        <div>
          <Nav />
        </div>
        <div className="flex-grow-1">{screen}</div>
      </div>
    </AppContext>
  );
}
