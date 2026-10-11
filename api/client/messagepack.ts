import {
  Decoder,
  decodeTimestampToTimeSpec,
  Encoder,
  encodeTimeSpecToTimestamp,
  EXT_TIMESTAMP,
  ExtensionCodec,
} from "@msgpack/msgpack";

const extensionCodec = new ExtensionCodec();
if (typeof Temporal !== "undefined") {
  extensionCodec.register({
    type: EXT_TIMESTAMP,
    encode(input: unknown): Uint8Array | null {
      if (input instanceof Temporal.Instant) {
        const sec = Math.floor(input.epochMilliseconds / 1e3);
        const nsec = Number(input.epochNanoseconds - BigInt(sec) * BigInt(1e9));
        return encodeTimeSpecToTimestamp({ sec, nsec });
      } else {
        return null;
      }
    },
    decode(data: Uint8Array): Temporal.Instant {
      const timeSpec = decodeTimestampToTimeSpec(data);
      return Temporal.Instant.fromEpochNanoseconds(
        BigInt(timeSpec.sec) * BigInt(1e9) + BigInt(timeSpec.nsec),
      );
    },
  });
}

export const mpEncoder = new Encoder({ extensionCodec });
export const mpDecoder = new Decoder({ extensionCodec });
