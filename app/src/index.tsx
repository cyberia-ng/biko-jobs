// @ts-expect-error
import "bootstrap/dist/css/bootstrap.min.css";
import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Kanban } from "./kanban.tsx";
import { Store } from "./store.ts";

window.onload = () => {
  Store.init("http://localhost:3000", "some-session", "some-password").then((store) => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App store={store} />
      </StrictMode>,
    );
  });
};

function App(props: { store: Store }) {
  const state = useSyncExternalStore(
    props.store.subscribe.bind(props.store),
    props.store.getSnapshot.bind(props.store),
  );
  return <Kanban state={state} />;
}
