/**
 * Claim keys and PDA seed derivation.
 *
 * Every protected field gets its own claim record. A single hash over
 * name+ticker+image would let an attacker change one field and reuse the
 * others, so fields are domain-separated with a tag byte and hashed to a fixed
 * 32 bytes before being used as a PDA seed.
 *
 *   seeds = ["claim", namespace(32), field_tag(1), sha256(key)(32)]
 */

import { concat, lenBytes, u8, utf8 } from "./encoding.ts";
import { domainHash } from "./hash.ts";

export const FieldTag = {
  Name: 0x01,
  Ticker: 0x02,
  RawImage: 0x03,
  PixelImage: 0x04,
} as const;
export type FieldTag = (typeof FieldTag)[keyof typeof FieldTag];
export type FieldName = "name" | "ticker" | "rawImage" | "pixelImage";

export const FIELD_NAMES: Record<FieldTag, FieldName> = {
  [FieldTag.Name]: "name",
  [FieldTag.Ticker]: "ticker",
  [FieldTag.RawImage]: "rawImage",
  [FieldTag.PixelImage]: "pixelImage",
};

export const FIELD_TAGS: Record<FieldName, FieldTag> = {
  name: FieldTag.Name,
  ticker: FieldTag.Ticker,
  rawImage: FieldTag.RawImage,
  pixelImage: FieldTag.PixelImage,
};

/**
 * 32-byte claim key hash. `key` is the normalized text key (UTF-8) for
 * name/ticker or the 32-byte digest for image fields.
 */
export function claimKeyHash(namespace: Uint8Array, field: FieldTag, key: Uint8Array): Uint8Array {
  if (namespace.length !== 32) throw new RangeError("namespace must be 32 bytes");
  return domainHash("vampless/claim/v1", namespace, u8(field), lenBytes(key));
}

export function textClaimKey(namespace: Uint8Array, field: typeof FieldTag.Name | typeof FieldTag.Ticker, normalizedKey: string) {
  return claimKeyHash(namespace, field, utf8(normalizedKey));
}

export function imageClaimKey(
  namespace: Uint8Array,
  field: typeof FieldTag.RawImage | typeof FieldTag.PixelImage,
  digest: Uint8Array,
) {
  if (digest.length !== 32) throw new RangeError("image digest must be 32 bytes");
  return claimKeyHash(namespace, field, digest);
}

/** Seeds to pass to `PublicKey.findProgramAddressSync` / `Pubkey::find_program_address`. */
export function claimPdaSeeds(namespace: Uint8Array, field: FieldTag, key: Uint8Array): Uint8Array[] {
  return [utf8("claim"), namespace, u8(field), claimKeyHash(namespace, field, key)];
}

export function identityPdaSeeds(namespace: Uint8Array, identityId: Uint8Array): Uint8Array[] {
  return [utf8("identity"), namespace, identityId];
}

export function commitmentPdaSeeds(namespace: Uint8Array, commitment: Uint8Array): Uint8Array[] {
  return [utf8("commitment"), namespace, commitment];
}

export function mintBindingPdaSeeds(namespace: Uint8Array, mint: Uint8Array): Uint8Array[] {
  return [utf8("mint"), namespace, mint];
}

/** Flatten seeds for debugging/display. */
export function seedsToHexList(seeds: Uint8Array[]): string[] {
  return seeds.map((s) => Array.from(s, (b) => b.toString(16).padStart(2, "0")).join(""));
}

export { concat };
