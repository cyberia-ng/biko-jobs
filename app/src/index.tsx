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
import { Store as ServiceStore } from "./service-state/store.ts";
import { enableMapSet, produce } from "immer";
import { assertNever } from "./assertNever.ts";
import { Export } from "./screens/export.tsx";
import { useHashLocation } from "./use-hash-location.ts";
import type { State as NavigationState } from "./navigation-state.ts";

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

  const [serviceStore, setServiceStore] = useState<ServiceStore | undefined>(undefined);
  const serviceState = useSyncExternalStore(
    useCallback(
      (cb) => (serviceStore === undefined ? () => () => undefined : serviceStore.subscribe(cb)),
      [serviceStore],
    ),
    useCallback(
      () => (serviceStore === undefined ? undefined : serviceStore.getSnapshot()),
      [serviceStore],
    ),
  );
  const refresh = useCallback(
    () => withLoading("refreshing service store", serviceStore?.refresh() ?? Promise.resolve()),
    [serviceStore, withLoading],
  );

  useEffect(() => {
    withLoading(
      `loading service store`,
      ServiceStore.openEphemeral(() => {}).then(setServiceStore),
    ).catch(console.error);
  }, [loginState, withLoading]);

  const context: AppContextT = {
    loginState,
    setLoginState,
    service: useMemo(
      () =>
        serviceState === undefined || serviceStore === undefined
          ? undefined
          : {
              state: serviceState,
              createJob: (uuid: string) =>
                withLoading(`creating job ${uuid}`, serviceStore.createJob(uuid)),
              dispatch: (action) =>
                withLoading(
                  `dispatching event: ${action.event.type}`,
                  serviceStore.dispatch(action),
                ),
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
            },
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
