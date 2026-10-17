import { SessionSharingChannel } from "@biko-jobs/api-client/session-sharing.ts";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useReducer, useState } from "react";
import { Spinner } from "../../components/blob-loader.tsx";
import {
  Modal,
  ModalBody,
  ModalConfirmButton,
  ModalDismissButton,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "../../components/modal.tsx";
import { serialize } from "../../navigation-state.ts";
import { Jdenticon } from "../../components/jdenticon.tsx";

export function ShareSession({ session, password }: { session: string; password: string }) {
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
    return (
      <div className="text-center">
        <Spinner />
      </div>
    );
  } else {
    const hash = serialize({
      screen: "session manager",
      keyExchange: { session, serverPublicKey: channel.publicKey },
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
                value={pairingApprovalData.clientPublicKey}
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
