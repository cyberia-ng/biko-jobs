import "./styles.scss";
import "temporal-polyfill/global";
import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
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
import { AppContext, type AppContextT } from "./context.ts";
import { Store as ServiceStore } from "./service-state/store.ts";
import { enableMapSet, produce } from "immer";
import { assertNever } from "./assert-never.ts";
import { Export } from "./screens/export.tsx";
import { useHashLocation } from "./use-hash-location.ts";
import type { State as NavigationState } from "./navigation-state.ts";
import { ApiClient } from "@biko-jobs/api-client";
import { initialState as initialLoginState, reducer as loginReducer } from "./login-state.ts";
import { Login } from "./screens/login.tsx";
import { Archive } from "./screens/archive.tsx";

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
  const [hash, navigateHash] = useHashLocation();
  const navigationState = useMemo(() => deserialize(hash) ?? initialNavigationState, [hash]);
  const navigate = useCallback(
    (state: NavigationState) => navigateHash(serialize(state)),
    [navigateHash],
  );
  const [loginState, dispatchLoginState] = useReducer(loginReducer, initialLoginState);

  const [loadingIds, dispatchLoading] = useReducer(
    (state: Set<string>, [add, id]: [boolean, string]) =>
      produce(state, (state) => {
        if (add) state.add(id);
        else state.delete(id);
      }),
    new Set(),
  );
  const withLoading = useCallback(
    async <T,>(description: string, p: Promise<T>): Promise<T | undefined> => {
      if (p === undefined) return;
      const id = crypto.randomUUID();
      dispatchLoading([true, id]);
      try {
        return await p;
      } catch (e) {
        console.error("loading promise rejection", description, e); // TODO error surfacing
      } finally {
        dispatchLoading([false, id]);
      }
    },
    [dispatchLoading],
  );

  const serviceStore = useMemo(() => {
    return new ServiceStore(apiClient, console.error.bind(console));
  }, [apiClient]);
  const serviceState = useSyncExternalStore(
    useCallback((cb) => serviceStore.subscribe(cb), [serviceStore]),
    useCallback(() => serviceStore.getSnapshot(), [serviceStore]),
  );
  const refresh = useCallback(() => {
    withLoading(
      "refresh",
      (async () => {
        const mks = await apiClient.listMasterKeys();
        dispatchLoginState({ type: "update master keys list", masterKeys: mks });
      })(),
    ).catch(console.error);
  }, [withLoading, apiClient, dispatchLoginState]);
  useEffect(() => {
    withLoading("refresh store", serviceStore.refresh(loginState)).catch(console.error);
  }, [serviceStore, loginState, withLoading]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (import.meta.env.DEV) {
    useEffect(() => {
      if (loginState.login !== undefined) return;
      const masterKey = loginState.masterKeys?.find((mk) => mk.name === "some name");
      if (masterKey === undefined) return;
      withLoading(
        "dev autologin",
        masterKey
          .toKeyPair("some password")
          .then((mk) => dispatchLoginState({ type: "log in with key pair", masterKey: mk })),
      ).catch(console.error);
    }, [loginState, withLoading]);
  }

  const context: AppContextT = {
    loginState,
    login: dispatchLoginState,
    service: useMemo(
      () => ({
        state: serviceState,
        createJob: (uuid: string) =>
          withLoading(`creating job ${uuid}`, serviceStore.createJob(uuid)),
        dispatch: (action) =>
          withLoading(`dispatching event: ${action.event.type}`, serviceStore.dispatch(action)),
        getBlob: (blobUUID: string, jobUUID: string) =>
          withLoading(
            `getting blob: ${blobUUID} in job ${jobUUID}`,
            serviceStore.getBlob(blobUUID, jobUUID),
          ),
        putBlob: (blobUUID, jobUUID, data) =>
          withLoading(
            `writing blob: ${blobUUID} in job ${jobUUID}`,
            serviceStore.putBlob(blobUUID, jobUUID, data),
          ),
      }),
      [serviceState, serviceStore, withLoading],
    ),
    loading: loadingIds.size !== 0,
    navigationState,
    navigate,
    refresh,
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
      <div className="vh-100 d-flex flex-column flex-sm-row">
        <div>
          <Nav />
        </div>
        <div className="flex-grow-1 vh-100 overflow-scroll">{screen}</div>
      </div>
    </AppContext>
  );
}
