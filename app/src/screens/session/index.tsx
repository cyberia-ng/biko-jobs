import { useContext, useState } from "react";
import { AppContext } from "../../context.ts";
import { SessionList } from "./list.tsx";
import { Login } from "./login.tsx";
import { ShareSession } from "./share.tsx";
import { Finalize } from "./finalize.tsx";

export function SessionManager() {
  const { sessionsList, loginState, setLoginState } = useContext(AppContext);
  const [session, setSession] = useState(loginState?.session ?? "");
  const [password, setPassword] = useState(
    loginState?.password ?? window.localStorage.getItem(`session passwords/${session}`) ?? "",
  );
  const [passwordReveal, setPasswordReveal] = useState(false);
  const [showShareSession, setShowShareSession] = useState(false);
  const [finalize, setFinalize] = useState<string | undefined>(undefined);
  const isConnected = loginState?.session === session;
  function loadSession(sessionId: string) {
    setShowShareSession(false);
    setSession(sessionId);
    setPassword(window.localStorage.getItem(`session passwords/${sessionId}`) ?? "");
  }
  function autogenerate() {
    const baseSessionId = Temporal.Now.plainDateISO()
      .toLocaleString("en-GB", {
        weekday: "long",
        year: "2-digit",
        month: "numeric",
        day: "numeric",
      })
      .replace(/,/g, "");
    let newSessionId = baseSessionId;
    let suffixNumber = 0;
    while (sessionsList.includes(newSessionId)) {
      suffixNumber++;
      newSessionId = `${baseSessionId} (${suffixNumber})`;
    }
    setSession(newSessionId);
    const pwLen = 20;
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
    window.localStorage.setItem(`session passwords/${session}`, password);
    setLoginState({ session: session, password });
  }
  return (
    <>
      {finalize && <Finalize session={session} onDismiss={() => setFinalize(undefined)} />}
      <div className="bg-white m-2 p-2 rounded shadow-sm fs-4">
        <Login />
        <div className="row m-0">
          <div className="col-12 col-md-6 border-end p-2 pe-0">
            <h3>Sessions</h3>
            <hr className="me-2" />
            <SessionList selectedSession={session} loadSession={loadSession} />
          </div>
          <div className="col-12 col-md-6 border-md-top">
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="mb-2">
                <label className="form-label" htmlFor="sessionId">
                  Session name
                </label>
                <input
                  className="form-control fs-4"
                  type="text"
                  id="sessionId"
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
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
              <div className="mb-2 d-flex">
                <div className="flex-grow-1">
                  <button
                    type="button"
                    className="btn btn-success me-2"
                    onClick={() => autogenerate()}
                  >
                    Autogenerate
                  </button>
                </div>
                {isConnected && (
                  <button
                    type="button"
                    className="btn btn-secondary me-2"
                    onClick={() => setFinalize(session)}
                  >
                    Finalize session
                  </button>
                )}
                {isConnected && (
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary me-2"
                      disabled={loginState?.session !== session || session.length === 0}
                      onClick={() => setShowShareSession(!showShareSession)}
                    >
                      Share session
                    </button>
                  </div>
                )}
                {isConnected ? (
                  <button type="button" className="btn btn-primary" disabled>
                    Connected
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={
                      loginState?.session === session ||
                      session.length === 0 ||
                      password.length === 0
                    }
                    onClick={() => connect()}
                  >
                    Connect
                  </button>
                )}
              </div>
              {showShareSession && (
                <div>
                  <ShareSession session={session} password={password} />
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
