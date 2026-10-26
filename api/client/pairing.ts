import { AuthToken, type Bytes } from "./index.ts";
import { mpDecoder, mpEncoder } from "./messagepack.ts";
import {
  generateX25519KeyPair,
  X25519PrivateKey,
  X25519PublicKey,
} from "@biko-jobs/api-client/crypto.ts";

export class PairingPublicKey {
  publicKey: X25519PublicKey;
  constructor(publicKey: X25519PublicKey) {
    this.publicKey = publicKey;
  }

  static async import(keyBytes: Bytes) {
    const key = await X25519PublicKey.import(keyBytes, "pairing");
    return new PairingPublicKey(key);
  }
}

export class PairingKeyPair extends PairingPublicKey {
  privateKey: X25519PrivateKey;
  private constructor(publicKey: X25519PublicKey, privateKey: X25519PrivateKey) {
    super(publicKey);
    this.privateKey = privateKey;
  }

  static async generate() {
    const keyPair = await generateX25519KeyPair("pairing");
    return new PairingKeyPair(keyPair.publicKey, keyPair.privateKey);
  }
}

type ClientMessage = { type: "client/pubkey"; publicKey: Bytes };
type ServerMessage =
  | {
      type: "server/accepted";
      clientFingerprint: string;
      encryptedAuthToken: Bytes;
    }
  | { type: "server/rejected"; clientFingerprint: string }
  | { type: "server/invalid request" };
type Message = ClientMessage | ServerMessage;

export type SessionSharingError = { type: "websocket error"; event: Event };

export type ServerChannelOpts = {
  baseUrl: string;
  requestId: string;
  approve: (clientFingerprint: string) => Promise<AuthToken | "rejected">;
  onWebSocketError: (e: Event) => void;
};
export class ServerChannel {
  private approve: ServerChannelOpts["approve"];
  private ws: WebSocket;

  private constructor(approve: ServerChannelOpts["approve"], ws: WebSocket) {
    this.approve = approve;
    this.ws = ws;
  }

  static async open(opts: ServerChannelOpts): Promise<ServerChannel> {
    const ws = new WebSocket(`${opts.baseUrl}/channel/share-${opts.requestId}`);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (event) => reject({ type: "websocket error", event });
    });
    ws.onerror = opts.onWebSocketError;
    return new ServerChannel(opts.approve, ws);
  }

  close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    this.ws.onerror = null;
    this.ws.close();
  }

  async pair() {
    return new Promise<void>((resolve, reject) => {
      this.ws.onmessage = (event: MessageEvent<Blob>) => {
        this.handleMessage(event)
          .then((messageResult) => {
            if (messageResult === "done") {
              this.ws.onmessage = null;
              resolve();
            }
          })
          .catch((e) => {
            this.ws.onmessage = null;
            reject(e);
          });
      };
    });
  }

  private async handleMessage(event: MessageEvent<Blob>): Promise<"done" | "ignore"> {
    const data = await event.data.bytes();
    const msg = mpDecoder.decode(data) as Message;
    if (
      msg.type === "server/accepted" ||
      msg.type === "server/rejected" ||
      msg.type === "server/invalid request"
    ) {
      return "ignore";
    }
    let clientKey: PairingPublicKey;
    try {
      clientKey = await PairingPublicKey.import(msg.publicKey);
    } catch (_e) {
      this.ws.send(
        mpEncoder.encode({
          type: "server/invalid request",
        } satisfies ServerMessage),
      );
      return "ignore";
    }
    const approved = await this.approve.call(null, clientKey.publicKey.fingerprint);
    if (approved === "rejected") {
      this.ws.send(
        mpEncoder.encode({
          type: "server/rejected",
          clientFingerprint: clientKey.publicKey.fingerprint,
        } satisfies ServerMessage),
      );
    } else {
      const encryptedAuthToken = await clientKey.publicKey.encrypt({
        type: "plaintext",
        data: mpEncoder.encode(approved.token),
      });
      const acceptMessage: ServerMessage = {
        type: "server/accepted",
        clientFingerprint: clientKey.publicKey.fingerprint,
        encryptedAuthToken: encryptedAuthToken.data,
      };
      this.ws.send(mpEncoder.encode(acceptMessage));
    }
    return "done";
  }
}

export type ClientResult = { type: "accepted"; authToken: AuthToken } | { type: "rejected" };

export type ClientChannelOpts = {
  baseUrl: string;
  requestId: string;
  onWebSocketError: (e: Event) => void;
};
export class ClientChannel {
  private ws: WebSocket;
  private keyPair: PairingKeyPair;
  fingerprint: string;

  private constructor(ws: WebSocket, keyPair: PairingKeyPair) {
    this.ws = ws;
    this.keyPair = keyPair;
    this.fingerprint = keyPair.publicKey.fingerprint;
  }

  static async open(opts: ClientChannelOpts) {
    const keyPair = await PairingKeyPair.generate();
    const ws = new WebSocket(`${opts.baseUrl}/channel/share-${opts.requestId}`);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (event) => reject(event);
    });
    ws.onerror = opts.onWebSocketError;
    return new ClientChannel(ws, keyPair);
  }

  close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    this.ws.onerror = null;
    this.ws.close();
  }

  async pair(): Promise<ClientResult> {
    const pubKeyBytes = await this.keyPair.publicKey.export();
    return new Promise<ClientResult>((resolve, reject) => {
      this.ws.onmessage = (event: MessageEvent<Blob>) => {
        this.handleMessage(event)
          .then((result) => {
            if (result.type !== "ignore") {
              this.ws.onmessage = null;
              resolve(result);
            }
          })
          .catch((e) => {
            this.ws.onmessage = null;
            reject(e);
          });
      };
      const message: ClientMessage = { type: "client/pubkey", publicKey: pubKeyBytes };
      this.ws.send(mpEncoder.encode(message));
    }).finally(() => this.close());
  }

  private async handleMessage(
    event: MessageEvent<Blob>,
  ): Promise<ClientResult | { type: "ignore" }> {
    const data = await event.data.bytes();
    const message = mpDecoder.decode(data) as Message;
    if (message.type === "client/pubkey" || message.type === "server/invalid request") {
      return { type: "ignore" };
    }
    if (message.clientFingerprint !== this.keyPair.publicKey.fingerprint) {
      return { type: "ignore" };
    }
    if (message.type === "server/rejected") return { type: "rejected" };
    const decrypted = await this.keyPair.privateKey.decrypt({
      type: "ciphertext",
      data: message.encryptedAuthToken,
    });
    const token = AuthToken.import(decrypted.data);
    return { type: "accepted", authToken: token };
  }
}
