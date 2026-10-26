import { assertNever } from "./assertNever.ts";

export type State =
  | {
      screen: "kanban" | "new job" | "export" | "archive";
    }
  | { screen: "job detail"; uuid: string }
  | { screen: "edit job"; uuid: string }
  | { screen: "login"; pairingRequestId: string | undefined };

export const basicScreen = (screen: "kanban" | "new job" | "export" | "archive"): State => ({
  screen,
});

export const jobDetail = (uuid: string): State => ({ screen: "job detail", uuid });
export const editJob = (uuid: string): State => ({ screen: "edit job", uuid });
export const login = (pairingRequestId: string | undefined): State => ({
  screen: "login",
  pairingRequestId,
});

export const initialState: State = {
  screen: "login",
  pairingRequestId: undefined,
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
    case "archive":
      return basicScreen("archive");
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
    case "login":
      const pairingRequestId = components.shift();
      return login(pairingRequestId);
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
    case "login":
      components.push("login");
      if (state.pairingRequestId !== undefined) components.push(state.pairingRequestId);
      break;
    case "archive":
      components.push("archive");
      break;
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
