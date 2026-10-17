import { SessionSharingReceiver } from "@biko-jobs/api-client/session-sharing.ts";
import { useContext, useEffect, useReducer, useState } from "react";
import { Spinner } from "../../components/blob-loader.tsx";
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalDismissButton,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "../../components/modal.tsx";
import { AppContext } from "../../context.ts";
import { sessionManager } from "../../navigation-state.ts";
import { Jdenticon } from "../../components/jdenticon.tsx";

export function Login() {
  const { loginState, navigationState, navigate, setLoginState } = useContext(AppContext);
  const [sessionSharingReceiver, setSessionSharingReceiver] = useReducer(
    (state: SessionSharingReceiver | undefined, action: SessionSharingReceiver) => state ?? action,
    undefined,
  );
  const [rejected, setRejected] = useState(false);
  useEffect(() => {
    if (navigationState.screen !== "session manager") return;
    if (navigationState.keyExchange !== undefined) {
      const { session, serverPublicKey } = navigationState.keyExchange;
      SessionSharingReceiver.open({
        baseUrl: "api",
        session,
        serverPublicKey,
        onWebSocketError: console.error.bind(console),
      })
        .then((sessionSharingReceiver) => {
          setSessionSharingReceiver(sessionSharingReceiver);
          return sessionSharingReceiver.receivePassword();
        })
        .then((result) => {
          switch (result.type) {
            case "accepted":
              setLoginState({ session, password: result.password });
              navigate(sessionManager());
              break;
            case "rejected":
              setRejected(true);
          }
        });
    }
  }, [navigationState, navigate, loginState, setLoginState]);
  useEffect(() => () => sessionSharingReceiver?.close(), [sessionSharingReceiver]);
  if (navigationState.screen !== "session manager" || navigationState.keyExchange === undefined) {
    return null;
  }
  if (!rejected) {
    return (
      <Modal onDismiss={() => navigate(sessionManager())}>
        <ModalHeader>
          <ModalTitle>Pairing</ModalTitle>
          <ModalCloseButton />
        </ModalHeader>
        <ModalBody>
          <div className="mb-2 fs-5">The image on the approving device should match this one:</div>
          <div>
            {sessionSharingReceiver === undefined ? (
              <div className="text-center">
                <Spinner />
              </div>
            ) : (
              <Jdenticon
                value={sessionSharingReceiver.publicKey}
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
      <Modal onDismiss={() => navigate(sessionManager())}>
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
