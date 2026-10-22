import { useContext, useState } from "react";
import { AppContext } from "../context.ts";
import { MasterKeyPair, MasterKeyPublic } from "@biko-jobs/api-client";
import { Page } from "../components/page.tsx";
import { Spinner } from "../components/blob-loader.tsx";

type LoginResult = "ready" | "loading" | "wrong password";

export function Login() {
  const { loginState, login } = useContext(AppContext);
  const [loginResult, setLoginResult] = useState<LoginResult>("ready");
  if (loginState.masterKeys === undefined) {
    return (
      <Page>
        <Spinner />
      </Page>
    );
  }
  const savedCredentials = new Map(
    loginState.masterKeys.flatMap((mk) => {
      const password = window.localStorage.getItem(`saved password/${mk.uuid}`);
      return password !== null ? [[mk.uuid, password] as const] : [];
    }),
  );
  function submit(key: MasterKeyPublic, password: string) {
    setLoginResult("loading");
    key
      .toKeyPair(password)
      .then((keyPair) => {
        window.localStorage.setItem(`saved password/${keyPair.uuid}`, password);
        return keyPair;
      })
      .then((keyPair) => login({ type: "log in with key pair", masterKey: keyPair }))
      .then(() => setLoginResult("ready"))
      .catch(() => setLoginResult("wrong password"));
  }
  function ephemeral() {
    login({ type: "log in to ephemeral session" });
  }
  let connected: MasterKeyPair | "ephemeral" | undefined;
  switch (loginState.login?.type) {
    case undefined:
      connected = undefined;
      break;
    case "ephemeral":
      connected = "ephemeral";
      break;
    case "master key":
      connected = loginState.login.masterKey;
      break;
  }
  return (
    <LoginForm
      masterKeys={loginState.masterKeys}
      onSubmit={submit}
      onEphemeral={ephemeral}
      savedCredentials={savedCredentials}
      connected={connected}
      loginResult={loginResult}
    />
  );
}

export function LoginForm({
  masterKeys,
  onSubmit,
  onEphemeral,
  savedCredentials,
  connected,
  loginResult,
}: {
  masterKeys: MasterKeyPublic[];
  onSubmit: (key: MasterKeyPublic, password: string) => void;
  onEphemeral: () => void;
  savedCredentials: Map<string, string>;
  connected: MasterKeyPair | "ephemeral" | undefined;
  loginResult: LoginResult;
}) {
  const [selectedKey, setSelectedKey] = useState<MasterKeyPublic | undefined>(undefined);
  function submit(password: string) {
    if (selectedKey === undefined) {
      return;
    }
    onSubmit(selectedKey, password);
  }
  return (
    <Page>
      <div>
        <h3>Login</h3>
        <hr className="me-2" />
        <KeyList
          keys={masterKeys}
          selected={selectedKey}
          connected={connected}
          onSelect={setSelectedKey}
          onEphemeral={onEphemeral}
        />
      </div>
      {selectedKey !== undefined && (
        <div className="mt-2">
          <Credentials
            key={selectedKey?.uuid}
            savedPassword={savedCredentials.get(selectedKey.uuid)}
            onSubmit={submit}
            connected={connected instanceof MasterKeyPair && connected.uuid === selectedKey.uuid}
            loginResult={loginResult}
          />
        </div>
      )}
    </Page>
  );
}

export function KeyList({
  keys,
  selected,
  connected,
  onSelect,
  onEphemeral,
}: {
  keys: MasterKeyPublic[];
  selected: MasterKeyPublic | "ephemeral" | undefined;
  connected: MasterKeyPublic | "ephemeral" | undefined;
  onSelect: (key: MasterKeyPublic) => void;
  onEphemeral: () => void;
}) {
  return (
    <>
      {keys.length === 0 && <div className="mb-2">No master keys available</div>}
      <div className="list-group">
        {keys.map((key) => (
          <a
            href="#"
            className={"list-group-item p-2 d-flex" + (selected === key ? " active" : "")}
            key={key.uuid}
            onClick={(e) => {
              e.preventDefault();
              onSelect(key);
            }}
          >
            {connected instanceof MasterKeyPublic && connected.uuid === key.uuid && (
              <div>
                <i className="bi bi-link-45deg me-2" />
              </div>
            )}
            <div className="flex-grow-1">{key.name}</div>
            <div>
              <i className="bi bi-chevron-right" />
            </div>
          </a>
        ))}
        <a
          href="#"
          className={"list-group-item p-2 d-flex" + (selected === "ephemeral" ? " active" : "")}
          onClick={(e) => {
            e.preventDefault();
            onEphemeral();
          }}
        >
          {connected === "ephemeral" && (
            <div>
              <i className="bi bi-link-45deg me-2" />
            </div>
          )}
          <div className="flex-grow-1">Ephemeral session</div>
          <div>
            <i className="bi bi-chevron-right" />
          </div>
        </a>
      </div>
    </>
  );
}

export function Credentials({
  savedPassword,
  onSubmit,
  connected,
  loginResult,
}: {
  savedPassword: string | undefined;
  onSubmit: (password: string) => void;
  connected: boolean;
  loginResult: LoginResult;
}) {
  const [passwordReveal, setPasswordReveal] = useState(false);
  const [password, setPassword] = useState(savedPassword ?? "");
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <div className="mb-4">
        <label className="form-label" htmlFor="password">
          Password
        </label>
        <div className="d-flex">
          <input
            className="form-control rounded-end-0 fs-4"
            type={passwordReveal ? "text" : "password"}
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loginResult === "loading" || connected}
          />
          <button
            type="button"
            className="btn btn-secondary rounded-start-0 fs-4"
            onClick={() => setPasswordReveal(!passwordReveal)}
          >
            {passwordReveal ? (
              <i className="bi bi-eye-fill" />
            ) : (
              <i className="bi bi-eye-slash-fill" />
            )}
          </button>
        </div>
      </div>
      <div className="d-flex align-items-center">
        {connected ? (
          <button type="button" className="btn btn-primary fs-4" disabled>
            Connected
          </button>
        ) : (
          <button
            type="submit"
            className="btn btn-primary fs-4"
            disabled={password.length === 0 || loginResult === "loading"}
            onClick={() => onSubmit(password)}
          >
            Connect
          </button>
        )}
        {loginResult === "loading" && (
          <div className="ms-2">
            <Spinner />
          </div>
        )}
      </div>
      {loginResult === "wrong password" && (
        <div className="mt-3 alert alert-danger">Wrong password</div>
      )}
    </form>
  );
}
