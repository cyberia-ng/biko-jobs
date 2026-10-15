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
export async function receiveSharedSession(
  baseUrl: string,
  session: string,
  serverPublicKey: Uint8Array<ArrayBuffer>,
  onGenerateKey: (publicKey: Uint8Array<ArrayBuffer>) => void,
): Promise<ReceiveSharedSessionResult> {
  const { publicKey, privateKey } = await crypto.subtle.generateKey("X25519", false, ["deriveKey"]);
  const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  onGenerateKey(publicKeyBytes);
  const serverPublicKey_ = await crypto.subtle.importKey(
    "raw",
    serverPublicKey,
    "X25519",
    true,
    [],
  );
  const sharedKey = await crypto.subtle.deriveKey(
    { name: "X25519", public: serverPublicKey_ },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const ws = new WebSocket(`${baseUrl}/channel/share-${session}`);
  async function handleMessage(
    event: MessageEvent<Blob>,
  ): Promise<ReceiveSharedSessionResult | { type: "ignore" }> {
    const data = await event.data.bytes();
    const message = mpDecoder.decode(data) as Message;
    if (message.type === "client/pubkey") return { type: "ignore" };
    if (message.clientPubKey.toHex() !== publicKeyBytes.toHex()) return { type: "ignore" };
    if (message.type === "server/rejected") return { type: "rejected" };
    const decrypted = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: message.iv },
        sharedKey,
        message.encryptedPassword,
      ),
    );
    const password = new TextDecoder().decode(decrypted);
    return { type: "accepted", password };
  }
  return new Promise<ReceiveSharedSessionResult>((resolve, reject) => {
    ws.addEventListener("message", (event) =>
      handleMessage(event)
        .then((result) => {
          if (result.type !== "ignore") {
            resolve(result);
          }
        })
        .catch((e) => reject(e)),
    );
    ws.addEventListener("open", () => {
      const message: ClientMessage = {
        type: "client/pubkey",
        publicKey: publicKeyBytes,
      };
      ws.send(mpEncoder.encode(message));
    });
  }).finally(() => ws.close());
}
