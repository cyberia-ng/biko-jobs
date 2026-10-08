import { Fragment, useContext, useState } from "react";
import { AppContext } from "./context.ts";
import { Store } from "./store.ts";

export function SessionManager() {
  const { store, withLoading, dispatchLocal } = useContext(AppContext);
  const [sessionId, setSessionId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordReveal, setPasswordReveal] = useState(false);
  function autogenerate() {
    setSessionId(new Date().toISOString());
    const pwLen = 16;
    const pwCharset = "abcdefghijklmnopqrstuvwxyz0123456789";
    const limit = 256 - (256 % pwCharset.length);
    let pw: string = "";
    while (pw.length < pwLen) {
      const randBytes = crypto.getRandomValues(new Uint8Array(8));
      for (const byte of randBytes) {
        if (byte < limit) {
          pw += pwCharset[byte % pwCharset.length];
        }
      }
    }
    pw = pw.slice(0, pwLen);
    setPassword(pw);
  }
  async function connect() {
    await store.connect(sessionId, password);
    await store.refreshState();
    dispatchLocal({ type: "navigate", screen: "kanban" });
  }
  return (
    <div className="bg-white m-2 p-2 rounded shadow-sm fs-4">
      <div className="row">
        <div className="col-6 border-end">
          <SessionList />
        </div>
        <div className="col-6">
          <div className="mb-2">
            <label className="form-label" htmlFor="sessionId">
              Session name
            </label>
            <input
              className="form-control fs-4"
              type="text"
              id="sessionId"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            />
          </div>
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
              />
              <button
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
          <div className="mb-2">
            <button className="btn btn-success me-3 fs-4" onClick={() => autogenerate()}>
              Autogenerate
            </button>
            <button
              className="btn btn-primary fs-4"
              disabled={sessionId.length === 0 || password.length === 0}
              onClick={withLoading(() => connect())}
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SessionList() {
  const { state } = useContext(AppContext);
  return (
    <div>
      {state.sessions.map((session) => (
        <div key={session}>{session}</div>
      ))}
    </div>
  );
}
