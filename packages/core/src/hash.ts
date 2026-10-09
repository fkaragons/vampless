import { sha256 as nobleSha256 } from "@noble/hashes/sha256";
import { base58 } from "@scure/base";
import { concat, utf8 } from "./encoding.ts";

export function sha256(...parts: Uint8Array[]): Uint8Array {
  return nobleSha256(concat(...parts));
}

/** Domain-separated hash: sha256(utf8(domain) ‖ parts...). */
export function domainHash(domain: string, ...parts: Uint8Array[]): Uint8Array {
  return nobleSha256(concat(utf8(domain), ...parts));
}

export const b58 = {
  encode: (b: Uint8Array): string => base58.encode(b),
  decode: (s: string): Uint8Array => base58.decode(s),
};

/** Deterministic 32-byte namespace identifier from a human-readable label. */
export function namespaceId(label: string): Uint8Array {
  return domainHash("vampless/namespace/v1:", utf8(label));
}
