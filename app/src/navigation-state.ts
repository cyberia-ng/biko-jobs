import { assertNever } from "./assertNever.ts";

export type State =
  | {
      screen: "kanban" | "new job" | "export";
    }
  | {
      screen: "session manager";
      keyExchange:
        | {
            session: string;
            serverPublicKey: Uint8Array<ArrayBuffer>;
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

export function deserialize(hash: string): State | undefined {
  if (hash.length === 0) {
    return initialState;
  }
  const components = hash.split("/").map(decodeURIComponent);
  switch (components.shift()) {
    case "kanban":
      return basicScreen("kanban");
    case "new-job":
      return basicScreen("new job");
    case "export":
      return basicScreen("export");
    case "session-manager": {
      const session = components.shift();
      const serverPublicKeyB64 = components.shift();
      if (session !== undefined && serverPublicKeyB64 !== undefined) {
        return sessionManager({
          session,
          serverPublicKey: Uint8Array.fromBase64(serverPublicKeyB64, { alphabet: "base64url" }),
        });
      } else {
        return sessionManager();
      }
    }
    case "job-detail": {
      const uuid = components.shift();
      if (uuid === undefined) return undefined;
      return jobDetail(uuid);
    }
    case "edit-job": {
      const uuid = components.shift();
      if (uuid === undefined) return undefined;
      return editJob(uuid);
    }
    default:
      return undefined;
  }
}

export function serialize(state: State): string {
  const components: string[] = [];
  switch (state.screen) {
    case "kanban":
      components.push("kanban");
      break;
    case "new job":
      components.push("new-job");
      break;
    case "export":
      components.push("export");
      break;
    case "session manager": {
      components.push("session-manager");
      if (state.keyExchange !== undefined) {
        components.push(state.keyExchange.session);
        components.push(state.keyExchange.serverPublicKey.toBase64({ alphabet: "base64url" }));
      }
      break;
    }
    case "job detail":
      components.push("job-detail");
      components.push(state.uuid);
      break;
    case "edit job":
      components.push("edit-job");
      components.push(state.uuid);
      break;
    default:
      assertNever(state);
  }
  return components.map(encodeURIComponent).join("/");
}
