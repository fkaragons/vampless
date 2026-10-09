/**
 * Commit–reveal.
 *
 * A salted commitment hides the identity fields until the registration
 * transaction, so a mempool observer cannot copy a disclosed registration and
 * front-run it. It does not prove authorship and does not reserve the unseen
 * fields; only the final registration acquires claims.
 *
 *   commitment = sha256("vampless/commit/v1" ‖ namespace ‖ lenStr(policy)
 *                ‖ applicant ‖ intended_mint ‖ lenStr(name_key)
 *                ‖ lenStr(ticker_key) ‖ raw_digest ‖ pixel_digest
 *                ‖ metadata_digest ‖ salt)
 */

import { concat, fixed, lenStr, utf8, bytesEqual } from "./encoding.ts";
import { sha256 } from "./hash.ts";
import type { PolicyId } from "./types.ts";

export const COMMITMENT_DOMAIN = "vampless/commit/v1";

/** Pilot defaults — configuration, not constants. */
export const COMMITMENT_DEFAULTS = {
  minRevealDelaySlots: 2,
  maxLifetimeSlots: 1500,
} as const;

export const ZERO32 = new Uint8Array(32);

export interface CommitmentInputs {
  namespace: Uint8Array;
  policy: PolicyId;
  applicant: Uint8Array;
  intendedMint: Uint8Array;
  nameKey: string;
  tickerKey: string;
  rawImageDigest?: Uint8Array;
  pixelImageDigest?: Uint8Array;
  metadataDigest?: Uint8Array;
  salt: Uint8Array;
}

export function computeCommitment(c: CommitmentInputs): Uint8Array {
  return sha256(
    utf8(COMMITMENT_DOMAIN),
    fixed(c.namespace, 32, "namespace"),
    lenStr(c.policy),
    fixed(c.applicant, 32, "applicant"),
    fixed(c.intendedMint, 32, "intendedMint"),
    lenStr(c.nameKey),
    lenStr(c.tickerKey),
    fixed(c.rawImageDigest ?? ZERO32, 32, "rawImageDigest"),
    fixed(c.pixelImageDigest ?? ZERO32, 32, "pixelImageDigest"),
    fixed(c.metadataDigest ?? ZERO32, 32, "metadataDigest"),
    fixed(c.salt, 32, "salt"),
  );
}

export interface CommitmentRecord {
  commitment: Uint8Array;
  applicant: Uint8Array;
  intendedMint: Uint8Array;
  createdSlot: number;
  expirySlot: number;
  consumed: boolean;
}

export type CommitmentCheck = { ok: true } | { ok: false; reason: string };

export function verifyCommitmentReveal(
  rec: CommitmentRecord,
  inputs: CommitmentInputs,
  currentSlot: number,
  opts: { minRevealDelaySlots: number; maxLifetimeSlots: number } = COMMITMENT_DEFAULTS,
): CommitmentCheck {
  if (rec.consumed) return { ok: false, reason: "commitment already consumed" };
  if (!bytesEqual(rec.applicant, inputs.applicant)) return { ok: false, reason: "applicant mismatch" };
  if (!bytesEqual(rec.intendedMint, inputs.intendedMint)) return { ok: false, reason: "intended mint mismatch" };
  if (currentSlot < rec.createdSlot + opts.minRevealDelaySlots) return { ok: false, reason: "reveal too early" };
  if (currentSlot > rec.expirySlot || currentSlot > rec.createdSlot + opts.maxLifetimeSlots)
    return { ok: false, reason: "commitment expired" };
  if (!bytesEqual(computeCommitment(inputs), rec.commitment)) return { ok: false, reason: "commitment hash mismatch" };
  return { ok: true };
}

export { concat };
