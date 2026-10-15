import { useContext, useEffect, useReducer, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AppContext } from "../context.ts";
import { serialize } from "../local-state.ts";
import {
  receiveSharedSession,
  SessionSharingChannel,
} from "@biko-jobs/api-client/session-sharing.ts";
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalConfirmButton,
  ModalDismissButton,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "../components/modal.tsx";
import { updateCanvas } from "jdenticon";

export function SessionManager() {
  const { sessionsList, localState, dispatchLocal } = useContext(AppContext);
  const [sessionId, setSessionId] = useState(
    localState.loginState.type === "logged in" ? localState.loginState.session : "",
  );
  const [password, setPassword] = useState(
    localState.loginState.type === "logged in"
      ? localState.loginState.password
      : (window.localStorage.getItem(`session passwords/${sessionId}`) ?? ""),
  );
  function loadSession(sessionId: string) {
    setSessionId(sessionId);
    setPassword(window.localStorage.getItem(`session passwords/${sessionId}`) ?? "");
  }
  const [passwordReveal, setPasswordReveal] = useState(false);
  const [showShareSession, setShowShareSession] = useState(false);
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
    setSessionId(newSessionId);
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
    window.localStorage.setItem(`session passwords/${sessionId}`, password);
    dispatchLocal({ type: "log in", session: sessionId, password });
  }
  return (
    <>
      <div className="bg-white m-2 p-2 rounded shadow-sm fs-4">
        <Login />
        <div className="row m-0">
          <div className="col-12 col-md-6 border-end p-2 pe-0">
            <h3>Sessions</h3>
            <hr className="me-2" />
            <SessionList selectedSession={sessionId} loadSession={loadSession} />
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
                    className="btn btn-success me-2 fs-4"
                    onClick={() => autogenerate()}
                  >
                    Autogenerate
                  </button>
                </div>
                {localState.loginState.type === "logged in" &&
                localState.loginState.session === sessionId ? (
                  <button type="button" className="btn btn-primary fs-4" disabled>
                    Connected
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="btn btn-primary fs-4"
                    disabled={
                      (localState.loginState.type === "logged in" &&
                        localState.loginState.session === sessionId) ||
                      sessionId.length === 0 ||
                      password.length === 0
                    }
                    onClick={() => connect()}
                  >
                    Connect
                  </button>
                )}
              </div>
              <div>
                <div>
                  <button
                    type="button"
                    className="btn btn-secondary fs-4"
                    onClick={() => setShowShareSession(!showShareSession)}
                  >
                    Share session
                  </button>
                </div>
                <div>
                  {showShareSession && <ShareSession session={sessionId} password={password} />}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

export function SessionList(props: {
  selectedSession: string;
  loadSession: (sessionId: string) => void;
}) {
  const { localState, sessionsList } = useContext(AppContext);
  return (
    <div className="border-start border-top">
      <div
        className={
          "border-bottom p-2 d-flex" +
          (sessionsList.includes(props.selectedSession) ? "" : " bg-primary-subtle")
        }
        onClick={() => props.loadSession("")}
      >
        <div className="flex-grow-1">New session</div>
        <div>
          <i className="bi bi-chevron-right" />
        </div>
      </div>
      {sessionsList.toReversed().map((session) => (
        <div
          className={
            "border-bottom p-2 d-flex" +
            (props.selectedSession === session ? " bg-primary-subtle" : "")
          }
          key={session}
          onClick={() => props.loadSession(session)}
        >
          {localState.loginState.type === "logged in" &&
            localState.loginState.session === session && (
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

function ShareSession({ session, password }: { session: string; password: string }) {
  const [channel, setChannel] = useState<SessionSharingChannel | undefined>(undefined);
  type PairingApprovalData = {
    clientPublicKey: Uint8Array<ArrayBuffer>;
    approve: (approved: boolean) => void;
  };
  const [pairingApprovalData, dispatchPairingApprovalData] = useReducer(
    (state: PairingApprovalData | undefined, action: PairingApprovalData | "reset") =>
      action === "reset" ? undefined : (state ?? action),
    undefined,
  );
  useEffect(() => {
    SessionSharingChannel.open({
      baseUrl: "/api",
      session,
      password,
      approve: (key) =>
        new Promise((res) => {
          dispatchPairingApprovalData({
            clientPublicKey: key,
            approve: (approved) => {
              res(approved);
              dispatchPairingApprovalData("reset");
            },
          });
        }),
      onKeyExchange: () => {},
      onError: console.error.bind(console),
    }).then(setChannel);
  }, [session, password]);
  useEffect(() => () => channel?.close(), [channel]);
  if (channel === undefined) {
    return "loading";
  } else {
    const pubKeyB64 = channel.publicKey.toBase64();
    const hash = serialize({
      loginState: { type: "key exchange", session, serverPublicKeyB64: pubKeyB64 },
      screen: { type: "session manager" },
    });
    const url = new URL(window.location.href);
    url.hash = hash;
    return (
      <>
        {pairingApprovalData && (
          <Modal
            onDismiss={() => pairingApprovalData.approve(false)}
            onConfirm={() => pairingApprovalData.approve(true)}
          >
            <ModalHeader>
              <ModalTitle>Pairing request</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <div className="fs-5 mb-2">
                Check that this image matches the one on the device to be paired:
              </div>
              <Jdenticon
                value={pairingApprovalData.clientPublicKey.toHex()}
                width={150}
                height={150}
                className="d-block mx-auto p-2 border rounded"
              />
            </ModalBody>
            <ModalFooter>
              <ModalConfirmButton className="btn btn-success fs-5">Approve</ModalConfirmButton>
              <ModalDismissButton className="btn btn-secondary fs-5">Cancel</ModalDismissButton>
            </ModalFooter>
          </Modal>
        )}
        <QRCodeSVG
          value={url.toString()}
          className="d-block m-auto p-2 border rounded mt-2"
          height={300}
          width={300}
        />
        {import.meta.env.DEV && (
          <div>
            <a href={url.toString()} target="_blank">
              {url.toString()}
            </a>
          </div>
        )}
      </>
    );
  }
}

function Login() {
  const { localState, dispatchLocal } = useContext(AppContext);
  const [clientPublicKey, setClientPublicKey] = useReducer(
    (pkState: Uint8Array<ArrayBuffer> | undefined, pk: Uint8Array<ArrayBuffer>) => pkState ?? pk,
    undefined,
  );
  const [rejected, setRejected] = useState(false);
  useEffect(() => {
    if (localState.loginState.type === "key exchange") {
      const { session } = localState.loginState;
      const serverPublicKey = Uint8Array.fromBase64(localState.loginState.serverPublicKeyB64);
      receiveSharedSession("/api", localState.loginState.session, serverPublicKey, (publicKey) =>
        setClientPublicKey(publicKey),
      ).then((result) => {
        switch (result.type) {
          case "accepted":
            dispatchLocal({ type: "log in", session, password: result.password });
            break;
          case "rejected":
            setRejected(true);
        }
      });
    }
  }, [localState.loginState, dispatchLocal]);
  // TODO cleanup websocket on cancel
  if (localState.loginState.type !== "key exchange") {
    return null;
  }
  if (!rejected) {
    return (
      <Modal onDismiss={() => dispatchLocal({ type: "cancel key exchange" })}>
        <ModalHeader>
          <ModalTitle>Pairing</ModalTitle>
          <ModalCloseButton />
        </ModalHeader>
        <ModalBody>
          <div className="mb-2 fs-5">The image on the approving device should match this one:</div>
          <div>
            {clientPublicKey === undefined ? (
              "loading"
            ) : (
              <Jdenticon
                value={clientPublicKey.toHex()}
                width={150}
                height={150}
                className="d-block mx-auto p-2 rounded border"
              />
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalDismissButton className="btn btn-danger fs-5">Cancel pairing</ModalDismissButton>
        </ModalFooter>
      </Modal>
    );
  } else {
    return (
      <Modal onDismiss={() => dispatchLocal({ type: "cancel key exchange" })}>
        <ModalHeader>
          <ModalTitle>Pairing rejected</ModalTitle>
          <ModalCloseButton />
        </ModalHeader>
        <ModalBody>
          <div className="fs-5">The remote device rejected the pairing request.</div>
        </ModalBody>
        <ModalFooter>
          <ModalDismissButton className="btn btn-primary fs-5">OK</ModalDismissButton>
        </ModalFooter>
      </Modal>
    );
  }
}

function Jdenticon({
  value,
  className,
  width,
  height,
}: {
  value: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (canvasRef.current !== null) {
      updateCanvas(canvasRef.current, value);
    }
  }, [canvasRef, value]);
  return <canvas ref={canvasRef} className={className} width={width} height={height} />;
}
