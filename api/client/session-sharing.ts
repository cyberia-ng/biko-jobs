import { mpDecoder, mpEncoder } from "./messagepack.ts";

type ClientMessage = { type: "client/pubkey"; publicKey: Uint8Array<ArrayBuffer> };
type ServerMessage =
  | {
      type: "server/accepted";
      clientPubKey: Uint8Array<ArrayBuffer>;
      iv: Uint8Array<ArrayBuffer>;
      encryptedPassword: Uint8Array<ArrayBuffer>;
    }
  | { type: "server/rejected"; clientPubKey: Uint8Array<ArrayBuffer> };
type Message = ClientMessage | ServerMessage;

export type SessionSharingError =
  | { type: "websocket error"; event: Event }
  | { type: "message handling error"; error: unknown };

export type SessionSharingChannelOpts = {
  baseUrl: string;
  session: string;
  password: string;
  approve: (publicKey: Uint8Array<ArrayBuffer>) => Promise<boolean>;
  onKeyExchange: (clientPublicKey: Uint8Array<ArrayBuffer>) => void;
  onError: (e: SessionSharingError) => void;
};

export class SessionSharingChannel {
  private opts: SessionSharingChannelOpts;
  private ws: WebSocket;
  publicKey: Uint8Array<ArrayBuffer>;
  private privateKey: CryptoKey;
  private wsErrorHandler: (event: Event) => void;

  private constructor(
    opts: SessionSharingChannelOpts,
    ws: WebSocket,
    wsErrorHandler: (event: Event) => void,
    publicKey: Uint8Array<ArrayBuffer>,
    privateKey: CryptoKey,
  ) {
    this.opts = opts;
    this.publicKey = publicKey;
    this.privateKey = privateKey;
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
    if (msg.type === "server/accepted" || msg.type === "server/rejected") return;
    const approved = await this.opts.approve(msg.publicKey);
    if (!approved) {
      this.ws.send(
        mpEncoder.encode({
          type: "server/rejected",
          clientPubKey: msg.publicKey,
        } satisfies ServerMessage),
      );
      return;
    }
    const clientPublicKey = await crypto.subtle.importKey("raw", msg.publicKey, "X25519", true, []);
    const sharedKey = await crypto.subtle.deriveKey(
      { name: "X25519", public: clientPublicKey },
      this.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sharedKey,
        new TextEncoder().encode(this.opts.password),
      ),
    );
    const acceptMessage: ServerMessage = {
      type: "server/accepted",
      clientPubKey: msg.publicKey,
      iv,
      encryptedPassword: encrypted,
    };
    this.ws.send(mpEncoder.encode(acceptMessage));
    this.opts.onKeyExchange(msg.publicKey);
  }

  static async open(opts: SessionSharingChannelOpts): Promise<SessionSharingChannel> {
    const { publicKey, privateKey } = await crypto.subtle.generateKey("X25519", false, [
      "deriveKey",
    ]);
    const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
    const ws = new WebSocket(`${opts.baseUrl}/channel/share-${opts.session}`);
    const wsErrorHandler = (event: Event) => opts.onError({ type: "websocket error", event });
    ws.addEventListener("error", wsErrorHandler);
    await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));
    return new SessionSharingChannel(opts, ws, wsErrorHandler, publicKeyBytes, privateKey);
  }

  close() {
    this.ws.removeEventListener("error", this.wsErrorHandler);
    this.ws.close();
  }
}

export type ReceiveSharedSessionResult =
  | { type: "accepted"; password: string }
  | { type: "rejected" };

export type SessionSharingReceiverOpts = {
  baseUrl: string;
  session: string;
  serverPublicKey: Uint8Array<ArrayBuffer>;
  onWebSocketError: (e: Event) => void;
};
export class SessionSharingReceiver {
  private opts: SessionSharingReceiverOpts;
  private ws: WebSocket;
  publicKey: Uint8Array<ArrayBuffer>;
  private sharedKey: CryptoKey;

  private constructor(
    opts: SessionSharingReceiverOpts,
    ws: WebSocket,
    publicKey: Uint8Array<ArrayBuffer>,
    sharedKey: CryptoKey,
  ) {
    this.opts = opts;
    this.ws = ws;
    this.publicKey = publicKey;
    this.sharedKey = sharedKey;
  }

  static async open(opts: SessionSharingReceiverOpts) {
    const { publicKey, privateKey } = await crypto.subtle.generateKey("X25519", false, [
      "deriveKey",
    ]);
    const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
    const serverPublicKey = await crypto.subtle.importKey(
      "raw",
      opts.serverPublicKey,
      "X25519",
      true,
      [],
    );
    const sharedKey = await crypto.subtle.deriveKey(
      { name: "X25519", public: serverPublicKey },
      privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const ws = new WebSocket(`${opts.baseUrl}/channel/share-${opts.session}`);
    ws.addEventListener("error", opts.onWebSocketError);
    await new Promise<void>((res) => ws.addEventListener("open", () => res()));
    return new SessionSharingReceiver(opts, ws, publicKeyBytes, sharedKey);
  }

  private async handleMessage(
    event: MessageEvent<Blob>,
  ): Promise<ReceiveSharedSessionResult | { type: "ignore" }> {
    const data = await event.data.bytes();
    const message = mpDecoder.decode(data) as Message;
    if (message.type === "client/pubkey") return { type: "ignore" };
    if (message.clientPubKey.toHex() !== this.publicKey.toHex()) return { type: "ignore" };
    if (message.type === "server/rejected") return { type: "rejected" };
    const decrypted = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: message.iv },
        this.sharedKey,
        message.encryptedPassword,
      ),
    );
    const password = new TextDecoder().decode(decrypted);
    return { type: "accepted", password };
  }

  async receivePassword(): Promise<ReceiveSharedSessionResult> {
    return new Promise<ReceiveSharedSessionResult>((resolve, reject) => {
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
      const message: ClientMessage = { type: "client/pubkey", publicKey: this.publicKey };
      this.ws.send(mpEncoder.encode(message));
    }).finally(() => this.close());
  }

  close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    this.ws.removeEventListener("error", this.opts.onWebSocketError);
    this.ws.close();
  }
}
