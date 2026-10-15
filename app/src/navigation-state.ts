export type State =
  | {
      screen: "kanban" | "new job" | "export";
    }
  | {
      screen: "session manager";
      keyExchange:
        | {
            session: string;
            serverPublicKeyB64: string;
          }
        | undefined;
    }
  | { screen: "job detail"; uuid: string }
  | { screen: "edit job"; uuid: string };

export const basicScreen = (screen: "kanban" | "new job" | "export"): State => ({
  screen,
});

export const jobDetail = (uuid: string): State => ({ screen: "job detail", uuid });
export const editJob = (uuid: string): State => ({ screen: "edit job", uuid });
export const sessionManager = (
  keyExchange?: Extract<State, { screen: "session manager" }>["keyExchange"],
): State => ({ screen: "session manager", keyExchange });

export const initialState: State = {
  screen: "session manager",
  keyExchange: undefined,
};

export function deserialize(hash: string): State {
  if (hash.length === 0) {
    return initialState;
  }
  try {
    return JSON.parse(decodeURIComponent(hash));
    // oxlint-disable-next-line no-unused-vars
  } catch (e) {
    return initialState;
  }
}

export function serialize(state: State): string {
  return encodeURIComponent(JSON.stringify(state));
}
