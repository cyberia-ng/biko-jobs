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

export type SessionSharingError =
  | { type: "websocket error"; event: Event }
  | { type: "message handling error"; error: unknown };

export type ServerChannelOpts = {
  baseUrl: string;
  requestId: string;
  approve: (clientFingerprint: string) => Promise<AuthToken | "rejected">;
  onKeyExchange: (clientFingerprint: string) => void;
  onError: (e: SessionSharingError) => void;
};
export class ServerChannel {
  private opts: ServerChannelOpts;
  private ws: WebSocket;
  private wsErrorHandler: (event: Event) => void;

  private constructor(
    opts: ServerChannelOpts,
    ws: WebSocket,
    wsErrorHandler: (event: Event) => void,
  ) {
    this.opts = opts;
    this.ws = ws;
    this.wsErrorHandler = wsErrorHandler;
    this.ws.addEventListener("message", (event) =>
      this.wsMessageHandler(event).catch((error) =>
        this.opts.onError({ type: "message handling error", error }),
      ),
    );
  }

  private async wsMessageHandler(event: MessageEvent<Blob>) {
    const data = await event.data.bytes();
    const msg = mpDecoder.decode(data) as Message;
    if (
      msg.type === "server/accepted" ||
      msg.type === "server/rejected" ||
      msg.type === "server/invalid request"
    ) {
      return;
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
      return;
    }
    const approved = await this.opts.approve(clientKey.publicKey.fingerprint);
    if (approved === "rejected") {
      this.ws.send(
        mpEncoder.encode({
          type: "server/rejected",
          clientFingerprint: clientKey.publicKey.fingerprint,
        } satisfies ServerMessage),
      );
      return;
    }
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
    this.opts.onKeyExchange(clientKey.publicKey.fingerprint);
  }

  static async open(opts: ServerChannelOpts): Promise<ServerChannel> {
    const ws = new WebSocket(`${opts.baseUrl}/channel/share-${opts.requestId}`);
    const wsErrorHandler = (event: Event) => opts.onError({ type: "websocket error", event });
    ws.addEventListener("error", wsErrorHandler);
    await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));
    return new ServerChannel(opts, ws, wsErrorHandler);
  }

  close() {
    this.ws.removeEventListener("error", this.wsErrorHandler);
    this.ws.close();
  }
}

export type ClientResult = { type: "accepted"; authToken: AuthToken } | { type: "rejected" };

export type ClientChannelOpts = {
  baseUrl: string;
  requestId: string;
  onWebSocketError: (e: Event) => void;
};
export class ClientChannel {
  private opts: ClientChannelOpts;
  private ws: WebSocket;
  private keyPair: PairingKeyPair;
  fingerprint: string;

  private constructor(opts: ClientChannelOpts, ws: WebSocket, keyPair: PairingKeyPair) {
    this.opts = opts;
    this.ws = ws;
    this.keyPair = keyPair;
    this.fingerprint = keyPair.publicKey.fingerprint;
  }

  static async open(opts: ClientChannelOpts) {
    const keyPair = await PairingKeyPair.generate();
    const ws = new WebSocket(`${opts.baseUrl}/channel/share-${opts.requestId}`);
    ws.addEventListener("error", opts.onWebSocketError);
    await new Promise<void>((res) => ws.addEventListener("open", () => res()));
    return new ClientChannel(opts, ws, keyPair);
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

  async receiveAuthToken(): Promise<ClientResult> {
    const pubKeyBytes = await this.keyPair.publicKey.export();
    return new Promise<ClientResult>((resolve, reject) => {
      const handler = (event: MessageEvent<Blob>) =>
        this.handleMessage(event)
          .then((result) => {
            if (result.type !== "ignore") {
              this.ws.removeEventListener("message", handler);
              resolve(result);
            }
          })
          .catch((e) => {
            this.ws.removeEventListener("message", handler);
            reject(e);
          });
      this.ws.addEventListener("message", handler);
      const message: ClientMessage = { type: "client/pubkey", publicKey: pubKeyBytes };
      this.ws.send(mpEncoder.encode(message));
    }).finally(() => this.close());
  }

  close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    this.ws.removeEventListener("error", this.opts.onWebSocketError);
    this.ws.close();
  }
}
