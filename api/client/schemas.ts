import { z } from "zod";

export const ApiEvent = z.object({
  uuid: z.uuidv4(),
  data: z.instanceof(Uint8Array),
});
export type ApiEvent = z.infer<typeof ApiEvent>;

export const FinalizationData = z.object({
  knownEventUUIDs: z.array(z.string()),
  events: z.array(ApiEvent),
  blobsToKeep: z.array(z.string()),
});
export type FinalizationData = z.infer<typeof FinalizationData>;
