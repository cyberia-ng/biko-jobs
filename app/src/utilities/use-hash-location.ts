import { useSyncExternalStore } from "react";

const listeners: { v: Array<() => void> } = {
  v: [],
};

export type NavigationHook = (opts: {
  to: string;
  unhook: () => void;
}) => void | { prevent: boolean };
const navigationHooks: Set<NavigationHook> = new Set();
export function addNavigationHook(hook: NavigationHook): () => void {
  navigationHooks.add(hook);
  return () => navigationHooks.delete(hook);
}

const onHashChange = () => listeners.v.forEach((cb) => cb());

const subscribeToHashUpdates = (callback: () => void) => {
  if (listeners.v.push(callback) === 1) addEventListener("hashchange", onHashChange);

  return () => {
    listeners.v = listeners.v.filter((i) => i !== callback);
    if (!listeners.v.length) removeEventListener("hashchange", onHashChange);
  };
};

const currentHashLocation = () => location.hash.replace(/^#?/, "");

const navigate = (to: string) => {
  for (const hook of navigationHooks) {
    const hookRet = hook({
      to,
      unhook: () => navigationHooks.delete(hook),
    });
    if (hookRet !== undefined && hookRet.prevent) return;
  }
  const oldURL = location.href;

  const url = new URL(location.href);
  url.hash = to.replace(/^#?/, "");
  const newURL = url.href;

  if (newURL === oldURL) return;
  history.pushState(null, "", newURL);

  dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL }));
};

export const useHashLocation = () =>
  [
    useSyncExternalStore(subscribeToHashUpdates, currentHashLocation),
    navigate,
    addNavigationHook,
  ] as const;
