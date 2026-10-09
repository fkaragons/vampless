/**
 * Inspected-content attestations.
 *
 * The image verification service signs a statement about *what it inspected*,
 * bound to the applicant, the intended mint, the registry namespace, the
 * policy, and an expiry. The program verifies the signature (via the Ed25519
 * precompile) and then checks every binding against the registration
 * instruction. A creator-provided digest alone is never evidence.
 *
 * Encoding (all little-endian, length-delimited; mirrored in Rust):
 *   "vampless/attest/v1"
 *   u8      version (=1)
 *   [32]    namespace
 *   lenStr  network
 *   lenStr  policy
 *   lenStr  pipeline
 *   [32]    applicant
 *   [32]    intended_mint
 *   lenStr  metadata_uri
 *   [32]    metadata_digest
 *   [32]    raw_image_digest
 *   [32]    pixel_image_digest
 *   [8]     perceptual_hash
 *   [32]    nonce
 *   u16     signer_key_version
 *   u64     expiry_slot
 */

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { concat, fixed, lenStr, u16le, u64le, u8, utf8, bytesEqual } from "./encoding.ts";
import type { PolicyId } from "./types.ts";

// @noble/ed25519 v2 requires a sha512 implementation for sync APIs.
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

export const ATTESTATION_VERSION = 1;
export const ATTESTATION_DOMAIN = "vampless/attest/v1";

export interface AttestationStatement {
  version: number;
  namespace: Uint8Array;
  network: string;
  policy: PolicyId;
  pipeline: string;
  applicant: Uint8Array;
  intendedMint: Uint8Array;
  metadataUri: string;
  metadataDigest: Uint8Array;
  rawImageDigest: Uint8Array;
  pixelImageDigest: Uint8Array;
  perceptualHash: Uint8Array;
  nonce: Uint8Array;
  signerKeyVersion: number;
  expirySlot: bigint;
}

export interface SignedAttestation {
  statement: AttestationStatement;
  signature: Uint8Array;
  signer: Uint8Array;
}

export function encodeAttestation(s: AttestationStatement): Uint8Array {
  return concat(
    utf8(ATTESTATION_DOMAIN),
    u8(s.version),
    fixed(s.namespace, 32, "namespace"),
    lenStr(s.network),
    lenStr(s.policy),
    lenStr(s.pipeline),
    fixed(s.applicant, 32, "applicant"),
    fixed(s.intendedMint, 32, "intendedMint"),
    lenStr(s.metadataUri),
    fixed(s.metadataDigest, 32, "metadataDigest"),
    fixed(s.rawImageDigest, 32, "rawImageDigest"),
    fixed(s.pixelImageDigest, 32, "pixelImageDigest"),
    fixed(s.perceptualHash, 8, "perceptualHash"),
    fixed(s.nonce, 32, "nonce"),
    u16le(s.signerKeyVersion),
    u64le(s.expirySlot),
  );
}

export function signAttestation(statement: AttestationStatement, secretKey: Uint8Array): SignedAttestation {
  const msg = encodeAttestation(statement);
  const signature = ed.sign(msg, secretKey);
  const signer = ed.getPublicKey(secretKey);
  return { statement, signature, signer };
}

export function verifyAttestationSignature(att: SignedAttestation): boolean {
  try {
    return ed.verify(att.signature, encodeAttestation(att.statement), att.signer);
  } catch {
    return false;
  }
}

export interface AttestationBindings {
  namespace: Uint8Array;
  network: string;
  policy: PolicyId;
  applicant: Uint8Array;
  intendedMint: Uint8Array;
  metadataUri: string;
  metadataDigest: Uint8Array;
  rawImageDigest: Uint8Array;
  pixelImageDigest: Uint8Array;
  currentSlot: bigint | number;
  trustedSigners: Uint8Array[];
}

export type AttestationCheck = { ok: true } | { ok: false; reason: string };

/** Full verification: signature + every binding + expiry + trusted signer. */
export function verifyAttestation(att: SignedAttestation, b: AttestationBindings): AttestationCheck {
  const s = att.statement;
  if (s.version !== ATTESTATION_VERSION) return { ok: false, reason: "unsupported attestation version" };
  if (!b.trustedSigners.some((k) => bytesEqual(k, att.signer))) return { ok: false, reason: "attester key not trusted" };
  if (!verifyAttestationSignature(att)) return { ok: false, reason: "signature invalid" };
  if (!bytesEqual(s.namespace, b.namespace)) return { ok: false, reason: "namespace mismatch" };
  if (s.network !== b.network) return { ok: false, reason: "network mismatch" };
  if (s.policy !== b.policy) return { ok: false, reason: "policy mismatch" };
  if (!bytesEqual(s.applicant, b.applicant)) return { ok: false, reason: "applicant mismatch" };
  if (!bytesEqual(s.intendedMint, b.intendedMint)) return { ok: false, reason: "intended mint mismatch" };
  if (s.metadataUri !== b.metadataUri) return { ok: false, reason: "metadata URI mismatch" };
  if (!bytesEqual(s.metadataDigest, b.metadataDigest)) return { ok: false, reason: "metadata digest mismatch" };
  if (!bytesEqual(s.rawImageDigest, b.rawImageDigest)) return { ok: false, reason: "raw image digest mismatch" };
  if (!bytesEqual(s.pixelImageDigest, b.pixelImageDigest)) return { ok: false, reason: "pixel image digest mismatch" };
  const now = typeof b.currentSlot === "bigint" ? b.currentSlot : BigInt(b.currentSlot);
  if (s.expirySlot <= now) return { ok: false, reason: "attestation expired" };
  return { ok: true };
}

export function randomSecretKey(): Uint8Array {
  return ed.utils.randomPrivateKey();
}

export function publicKeyFromSecret(secret: Uint8Array): Uint8Array {
  return ed.getPublicKey(secret);
}

export function randomBytes(n: number): Uint8Array {
  return ed.etc.randomBytes(n);
}
