import { useSyncExternalStore } from "react";

const listeners: { v: Array<() => void> } = {
  v: [],
};

const onHashChange = () => listeners.v.forEach((cb) => cb());

const subscribeToHashUpdates = (callback: () => void) => {
  if (listeners.v.push(callback) === 1) addEventListener("hashchange", onHashChange);

  return () => {
    listeners.v = listeners.v.filter((i) => i !== callback);
    if (!listeners.v.length) removeEventListener("hashchange", onHashChange);
  };
};

const currentHashLocation = () => location.hash.replace(/^#?/, "");

export const navigate = (to: string) => {
  const oldURL = location.href;

  const url = new URL(location.href);
  url.hash = to.replace(/^#?/, "");
  const newURL = url.href;

  if (newURL === oldURL) return;
  history.pushState(null, "", newURL);

  dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL }));
};

export const useHashLocation = () =>
  [useSyncExternalStore(subscribeToHashUpdates, currentHashLocation), navigate] as const;
