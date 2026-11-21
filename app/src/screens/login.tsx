import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "../context.ts";
import {
  AuthToken,
  MasterKeyPair,
  MasterKeyPublic,
} from "@biko-jobs/api-client";
import { Page } from "../components/page.tsx";
import { Spinner } from "../components/blob-loader.tsx";
import {
  ClientChannel as PairingClientChannel,
  ServerChannel as PairingServerChannel,
} from "@biko-jobs/api-client/pairing.ts";
import { basicScreen, login as navigationLogin, serialize } from "../navigation/state.ts";
import { QRCodeSVG } from "qrcode.react";
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
import { assertNever } from "../utilities/assert-never.ts";

export function Login() {
  const { state, dispatch, navigationState, navigate } = useContext(AppContext);
  const { loginState } = state;
  const [pairingState, setPairingState] = useState<
    { masterKey: MasterKeyPair; requestId: string } | undefined
  >(undefined);
  const onPairingAccepted = useCallback((/*authToken: AuthToken*/) => {
    // login({ type: "log in to ephemeral session", authToken });
    navigate(basicScreen("new job"));
  }, [navigate]);
  if (loginState.masterKeys === "not loaded") {
    return (
      <Page>
        <Spinner />
      </Page>
    );
  }
  function submit(key: MasterKeyPublic, password: string) {
    dispatch({ type: "login/begin password login flow", masterKey: key, password });
  }
  let connected: MasterKeyPair | "ephemeral" | undefined;
  switch (loginState.login?.type) {
    case undefined:
    case "loading":
      connected = undefined;
      break;
    case "ephemeral":
      connected = "ephemeral";
      break;
    case "master key":
      connected = loginState.login.masterKey;
      break;
  }
  const loading = loginState.login?.type === "loading";
  return (
    <Page>
      <div>
        <h3>Login</h3>
        <hr />
        <LoginForm
          masterKeys={loginState.masterKeys}
          onSubmit={submit}
          connected={connected}
          loading={loading}
        />
      </div>
      {connected instanceof MasterKeyPair && (
        <div className="mt-4">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              setPairingState({ masterKey: connected, requestId: crypto.randomUUID() })
            }
            disabled={pairingState !== undefined}
          >
            Pair new device
          </button>
          {pairingState !== undefined && (
            <PairingServerDisplay
              key={pairingState.requestId}
              masterKey={pairingState.masterKey}
              requestId={pairingState.requestId}
              onFinished={() => setPairingState(undefined)}
            />
          )}
        </div>
      )}
      {navigationState.screen === "login" && navigationState.pairingRequestId !== undefined && (
        <PairingClientDisplay
          onCancel={() => navigate(navigationLogin(undefined))}
          requestId={navigationState.pairingRequestId}
          onAccepted={onPairingAccepted}
        />
      )}
    </Page>
  );
}

export function LoginForm({
  masterKeys,
  onSubmit,
  connected,
  loading,
}: {
  masterKeys: Array<{ key: MasterKeyPublic; savedPassword: string | undefined }>;
  onSubmit: (key: MasterKeyPublic, password: string) => void;
  connected: MasterKeyPair | "ephemeral" | undefined;
  loading: boolean;
}) {
  const [selectedKey, setSelectedKey] = useState<
    { key: MasterKeyPublic; savedPassword: string | undefined } | undefined
  >(undefined);
  function submit(password: string) {
    if (selectedKey === undefined) {
      return;
    }
    onSubmit(selectedKey.key, password);
  }
  return (
    <>
      <KeyList
        keys={masterKeys.map(({ key }) => key)}
        selected={selectedKey?.key}
        connected={connected}
        onSelect={(uuid) => setSelectedKey(masterKeys.find((k) => k.key.uuid === uuid))}
      />
      {selectedKey !== undefined && (
        <div className="mt-2">
          <Credentials
            key={selectedKey?.key.uuid}
            savedPassword={selectedKey?.savedPassword}
            onSubmit={submit}
            connected={
              connected instanceof MasterKeyPair && connected.uuid === selectedKey.key.uuid
            }
            loading={loading}
          />
        </div>
      )}
    </>
  );
}

export function KeyList({
  keys,
  selected,
  connected,
  onSelect,
}: {
  keys: MasterKeyPublic[];
  selected: MasterKeyPublic | "ephemeral" | undefined;
  connected: MasterKeyPair | "ephemeral" | undefined;
  onSelect: (keyUUID: string) => void;
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
              onSelect(key.uuid);
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
      </div>
    </>
  );
}

export function Credentials({
  savedPassword,
  onSubmit,
  connected,
  loading,
}: {
  savedPassword: string | undefined;
  onSubmit: (password: string) => void;
  connected: boolean;
  loading: boolean;
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
            disabled={loading || connected}
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
            disabled={password.length === 0 || loading}
            onClick={() => onSubmit(password)}
          >
            Connect
          </button>
        )}
        {loading && (
          <div className="ms-2">
            <Spinner />
          </div>
        )}
      </div>
      {/* TODO surface wrong password */}
      {/*loginResult === "wrong password" && (
        <div className="mt-3 alert alert-danger">Wrong password</div>
      )*/}
    </form>
  );
}

function PairingServerDisplay({
  masterKey,
  requestId,
  onFinished,
}: {
  masterKey: MasterKeyPair;
  requestId: string;
  onFinished: () => void;
}) {
  const [channel, setChannel] = useState<PairingServerChannel | undefined>(undefined);
  type PairingState =
    | {
        type: "pairing";
        clientFingerprint: string;
        approve: (approve: boolean) => void;
      }
    | { type: "ready" }
    | { type: "processing" };
  const [pairingState, setPairingState] = useState<PairingState>({
    type: "ready",
  });

  useEffect(() => {
    PairingServerChannel.open({
      baseUrl: "/api",
      requestId,
      approve: (fingerprint) =>
        new Promise((res) => {
          setPairingState({
            type: "pairing",
            clientFingerprint: fingerprint,
            approve: (approve) => {
              if (approve) {
                setPairingState({ type: "processing" });
                AuthToken.init({
                  masterKey,
                  expiry: Temporal.Now.instant().add(Temporal.Duration.from({ hours: 6 })),
                  permissions: new Set(["create streams", "read stream data", "write stream data"]),
                })
                  .then((authToken) => res(authToken))
                  .catch(console.error);
              } else {
                res("rejected");
              }
            },
          });
        }),
      onWebSocketError: console.error,
    })
      .then((channel) => {
        setChannel(channel);
        return channel.pair();
      })
      .then(() => onFinished())
      .catch(console.error);
  }, [requestId, masterKey, onFinished]);
  useEffect(() => () => channel?.close(), [channel]);
  if (channel === undefined || pairingState.type === "processing") {
    return (
      <div className="text-center">
        <Spinner />
      </div>
    );
  }
  switch (pairingState.type) {
    case "ready": {
      const hash = serialize(navigationLogin(requestId));
      const url = new URL(window.location.href);
      url.hash = hash;
      return (
        <Modal onDismiss={() => onFinished()}>
          <ModalHeader>
            <ModalTitle>Pairing</ModalTitle>
            <ModalCloseButton />
          </ModalHeader>
          <ModalBody>
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
          </ModalBody>
          <ModalFooter>
            <ModalDismissButton>Cancel</ModalDismissButton>
          </ModalFooter>
        </Modal>
      );
    }
    case "pairing":
      return (
        <Modal
          onDismiss={() => pairingState.approve(false)}
          onConfirm={() => pairingState.approve(true)}
        >
          <ModalHeader>
            <ModalTitle>Pairing request</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="fs-5 mb-2">
              Check that this image matches the one on the device to be paired:
            </div>
            <Jdenticon
              value={pairingState.clientFingerprint}
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
      );
    default:
      assertNever(pairingState);
  }
}

function PairingClientDisplay({
  requestId,
  onAccepted,
  onCancel,
}: {
  requestId: string;
  onAccepted: (authToken: AuthToken) => void;
  onCancel: () => void;
}) {
  const [pairingClientChannel, setPairingClientChannel] = useState<
    PairingClientChannel | undefined
  >(undefined);
  const [rejected, setRejected] = useState(false);
  useEffect(() => {
    PairingClientChannel.open({
      baseUrl: "/api",
      requestId,
      onWebSocketError: console.error,
    })
      .then((channel) => {
        setPairingClientChannel(channel);
        return channel.pair();
      })
      .then((result) => {
        switch (result.type) {
          case "accepted":
            onAccepted(result.authToken);
            break;
          case "rejected":
            setRejected(true);
        }
      })
      .catch(console.error);
  }, [requestId, onAccepted]);
  useEffect(() => () => pairingClientChannel?.close(), [pairingClientChannel]);

  if (!rejected) {
    return (
      <Modal onDismiss={() => onCancel()}>
        <ModalHeader>
          <ModalTitle>Pairing</ModalTitle>
          <ModalCloseButton />
        </ModalHeader>
        <ModalBody>
          <div className="mb-2 fs-5">The image on the approving device should match this one:</div>
          <div>
            {pairingClientChannel === undefined ? (
              <div className="text-center">
                <Spinner />
              </div>
            ) : (
              <Jdenticon
                value={pairingClientChannel.fingerprint}
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
      <Modal onDismiss={() => onCancel()}>
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
    if (canvasRef.current !== null) updateCanvas(canvasRef.current, value);
  }, [canvasRef, value]);
  return <canvas ref={canvasRef} className={className} width={width} height={height} />;
}
