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

export const Job = z.object({
  uuid: z.uuidv4(),
  keys: z.map(z.uuidv4(), Bytes),
});
export type Job = z.infer<typeof Job>;

export const NumberedJob = Job.extend({ number: z.number() });
export type NumberedJob = z.infer<typeof NumberedJob>;

export const JobList = z.array(NumberedJob);
export type JobList = z.infer<typeof JobList>;

export const JobEvent = z.object({
  job: z.uuidv4(),
  uuid: z.uuidv4(),
  data: Bytes,
});
export type JobEvent = z.infer<typeof JobEvent>;

export const SocketEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("new job"), job: NumberedJob }),
  z.object({ type: z.literal("job event"), event: JobEvent }),
]);
export type SocketEvent = z.infer<typeof SocketEvent>;

export const JobEvents = z.object({ events: z.array(JobEvent), emptyJobs: z.set(z.uuidv4()) });
export type JobEvents = z.infer<typeof JobEvents>;

export const JobUUIDs = z.set(z.uuidv4());
export type JobUUIDs = z.infer<typeof JobUUIDs>;

export const EventStreamMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("job event"),
    event: JobEvent,
  }),
  z.object({
    type: z.literal("job creation"),
    job: Job,
  }),
  z.object({
    type: z.literal("master key creation"),
  }),
]);
export type EventStreamMessage = z.infer<typeof EventStreamMessage>;

export const Permission = z.union([z.literal("add master key"), z.literal("write jobs")]);
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
