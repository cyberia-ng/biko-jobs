import { z } from "zod";

export const Bytes = z.instanceof(Uint8Array);
export type Bytes = z.infer<typeof Bytes>;

export const MasterKeyPublic = z.object({
  uuid: z.uuidv4(),
  name: z.string(),
  passwordSalt: Bytes,
  passwordHardness: z.int(),
  encryptionKeyPublic: Bytes,
  signingKeyPublic: Bytes,
});
export type MasterKeyPublic = z.infer<typeof MasterKeyPublic>;

export const MasterKey = MasterKeyPublic.extend({
  passwordHash: Bytes,
  encryptionKeyPrivateEncrypted: Bytes,
  signingKeyPrivateEncrypted: Bytes,
});
export type MasterKey = z.infer<typeof MasterKey>;

export const Stream = z.object({
  uuid: z.uuidv4(),
  keys: z.map(z.uuidv4(), Bytes),
});
export type Stream = z.infer<typeof Stream>;

export const NumberedStream = Stream.extend({ number: z.number() });
export type NumberedStream = z.infer<typeof NumberedStream>;

export const StreamList = z.array(NumberedStream);
export type StreamList = z.infer<typeof StreamList>;

export const StreamEvent = z.object({
  stream: z.uuidv4(),
  uuid: z.uuidv4(),
  data: Bytes,
});
export type StreamEvent = z.infer<typeof StreamEvent>;

export const SocketEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("new stream"), stream: NumberedStream }),
  z.object({ type: z.literal("stream event"), event: StreamEvent }),
]);
export type SocketEvent = z.infer<typeof SocketEvent>;

export const StreamEvents = z.object({
  events: z.array(StreamEvent),
  emptyStreams: z.set(z.uuidv4()),
});
export type StreamEvents = z.infer<typeof StreamEvents>;

export const StreamUUIDs = z.set(z.uuidv4());
export type StreamUUIDs = z.infer<typeof StreamUUIDs>;

export const EventStreamMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stream event"),
    event: StreamEvent,
  }),
  z.object({
    type: z.literal("stream creation"),
    stream: Stream,
  }),
  z.object({
    type: z.literal("master key creation"),
  }),
]);
export type EventStreamMessage = z.infer<typeof EventStreamMessage>;

export const Permission = z.union([
  z.literal("add master key"),
  z.literal("list streams"),
  z.literal("create streams"),
  z.literal("read stream data"),
  z.literal("write stream data"),
]);
export type Permission = z.infer<typeof Permission>;

export const Authorization = z.object({
  expiry: z.iso.datetime(),
  permissions: z.set(Permission),
});
export type Authorization = z.infer<typeof Authorization>;

export const AuthToken = z.object({
  masterKeyId: z.uuidv4(),
  authorization: Authorization,
  signature: Bytes,
});
export type AuthToken = z.infer<typeof AuthToken>;
