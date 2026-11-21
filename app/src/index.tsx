import "./styles.scss";
import "temporal-polyfill/global";
import { StrictMode, useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
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
import { AppContext, type AppContextT } from "./context.ts";
import { Store as ServiceStore2 } from "./service-state/store-2.ts";
import { enableMapSet } from "immer";
import { assertNever } from "./assert-never.ts";
import { Export } from "./screens/export.tsx";
import { useHashLocation } from "./use-hash-location.ts";
import type { State as NavigationState } from "./navigation-state.ts";
import { ApiClient } from "@biko-jobs/api-client";
import { Login } from "./screens/login.tsx";
import { Archive } from "./screens/archive.tsx";
import { makeEffector } from "./service-state/async-reducer.ts";

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
  const [hash, navigateHash, addNavigationHook] = useHashLocation();
  const navigationState = useMemo(() => deserialize(hash) ?? initialNavigationState, [hash]);
  const navigate = useCallback(
    (state: NavigationState) => navigateHash(serialize(state)),
    [navigateHash],
  );

  const serviceStore = useMemo(() => {
    return new ServiceStore2(makeEffector(apiClient));
  }, [apiClient]);
  const state = useSyncExternalStore(
    useCallback((cb) => serviceStore.subscribe(cb), [serviceStore]),
    useCallback(() => serviceStore.getSnapshot(), [serviceStore]),
  );
  const refresh = useCallback(() => {}, []);
  const { inner: serviceState, loginState } = state;
  console.log('state', state)

  if (import.meta.env.DEV) {
    // useEffect(() => {
    //   if (loginState.login !== undefined) return;
    //   if (navigationState.screen === "login" && navigationState.pairingRequestId !== undefined) {
    //     return;
    //   }
    //   const masterKey = loginState.masterKeys?.find((mk) => mk.name === "some name");
    //   if (masterKey === undefined) return;
    //   withLoading(
    //     "dev autologin",
    //     MasterKeyPassword.init(masterKey, "some password")
    //       .then((mkPassword) => apiClient.getMasterKeyPair(mkPassword))
    //       .then((mk) => dispatchLoginState({ type: "log in with key pair", masterKey: mk })),
    //   ).catch(console.error);
    // }, [apiClient, loginState, navigationState, withLoading]);
  }

  const context: AppContextT = {
    loginState,
    login: () => {},
    service: useMemo(
      () => ({
        state: serviceState,
        createJob: async () => {},
        dispatch: () => {},
        getBlob: async () => {
          throw new Error("not implemented");
        },
        putBlob: async () => {},
      }),
      [serviceState],
    ),
    loading: false,
    navigationState,
    navigate,
    addNavigationHook,
    refresh,
    apiClient,
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
    case "export":
      screen = <Export />;
      break;
    case "login":
      screen = <Login />;
      break;
    case "archive":
      screen = <Archive />;
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
