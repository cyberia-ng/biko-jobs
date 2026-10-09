import { useContext, useState } from "react";
import { AppContext } from "./context.ts";
import { QRCodeSVG } from "qrcode.react";
import pick from "lodash/pick.js";

export function SessionManager() {
  const { localState, dispatchLocal } = useContext(AppContext);
  const [sessionId, setSessionId] = useState(localState.currentSession?.session ?? "");
  const [password, setPassword] = useState(
    localState.currentSession?.password ??
      window.localStorage.getItem(`session passwords/${sessionId}`) ??
      "",
  );
  function loadSession(sessionId: string) {
    setSessionId(sessionId);
    setPassword(window.localStorage.getItem(`session passwords/${sessionId}`) ?? "");
  }
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
    window.localStorage.setItem(`session passwords/${sessionId}`, password);
    dispatchLocal({ type: "set current session", session: { session: sessionId, password } });
  }
  return (
    <div className="bg-white m-2 p-2 rounded shadow-sm fs-4">
      <div className="row m-0">
        <div className="col-12 col-md-6 border-end p-2 pe-0">
          <h3>Sessions</h3>
          <hr className="me-2" />
          <SessionList selectedSession={sessionId} loadSession={loadSession} />
        </div>
        <div className="col-12 col-md-6 border-md-top">
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
          <div className="mb-2 d-flex">
            <div className="flex-grow-1">
              <button className="btn btn-success me-2 fs-4" onClick={() => autogenerate()}>
                Autogenerate
              </button>
            </div>
            {localState.currentSession?.session === sessionId ? (
              <button className="btn btn-primary fs-4" disabled>
                Connected
              </button>
            ) : (
              <button
                className="btn btn-primary fs-4"
                disabled={
                  localState.currentSession?.session === sessionId ||
                  sessionId.length === 0 ||
                  password.length === 0
                }
                onClick={() => connect()}
              >
                Connect
              </button>
            )}
          </div>
          {localState.currentSession?.session === sessionId && (
            <div className="text-center">
              Scan to connect another device
              <div className="d-flex">
                <div className="mx-auto p-2 border rounded">
                  <SessionQRCode session={sessionId} password={password} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SessionQRCode(props: { session: string; password: string }) {
  const location = new URL(window.location.href);
  location.hash = btoa(JSON.stringify(pick(props, ["session", "password"])));
  return <QRCodeSVG value={location.toString()} height="256" width="256" />;
}

export function SessionList(props: {
  selectedSession: string;
  loadSession: (sessionId: string) => void;
}) {
  const { localState, state } = useContext(AppContext);
  return (
    <div className="border-start border-top">
      <div
        className={
          "border-bottom p-2 d-flex" +
          (state.sessions.includes(props.selectedSession) ? "" : " bg-primary-subtle")
        }
        onClick={() => props.loadSession("")}
      >
        <div className="flex-grow-1">New session</div>
        <div>
          <i className="bi bi-chevron-right" />
        </div>
      </div>
      {state.sessions.toReversed().map((session) => (
        <div
          className={
            "border-bottom p-2 d-flex" +
            (props.selectedSession === session ? " bg-primary-subtle" : "")
          }
          key={session}
          onClick={() => props.loadSession(session)}
        >
          {localState.currentSession?.session === session && (
            <div>
              <i className="bi bi-link-45deg text-primary me-2" />
            </div>
          )}
          <div className="flex-grow-1">{session}</div>
          <div>
            <i className="bi bi-chevron-right" />
          </div>
        </div>
      ))}
    </div>
  );
}
