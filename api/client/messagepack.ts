import {
  decode,
  Decoder,
  decodeTimestampToTimeSpec,
  encode,
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

const SET_EXT_TYPE = 0;
extensionCodec.register({
  type: SET_EXT_TYPE,
  encode: (object: unknown) => {
    if (object instanceof Set) {
      return encode([...object], { extensionCodec });
    } else {
      return null;
    }
  },
  decode: (data: Uint8Array) => {
    const array = decode(data, { extensionCodec }) as Array<unknown>;
    return new Set(array);
  },
});

const MAP_EXT_TYPE = 1;
extensionCodec.register({
  type: MAP_EXT_TYPE,
  encode: (object: unknown) => {
    if (object instanceof Map) {
      return encode([...object], { extensionCodec });
    } else {
      return null;
    }
  },
  decode: (data: Uint8Array) => {
    const array = decode(data, { extensionCodec }) as Array<[unknown, unknown]>;
    return new Map(array);
  },
});

export const mpEncoder = new Encoder({ extensionCodec });
export const mpDecoder = new Decoder({ extensionCodec });
