//! Length-delimited encodings shared with `@vampless/core`.
//! Any change here must be mirrored in `packages/core/src/*.ts` and covered by
//! the cross-implementation test vectors in `tests/vectors.rs`.

use anchor_lang::solana_program::hash::hashv;

pub const NAMESPACE_DOMAIN: &str = "vampless/namespace/v1:";
pub const CLAIM_DOMAIN: &str = "vampless/claim/v1";
pub const ATTEST_DOMAIN: &str = "vampless/attest/v1";
pub const COMMIT_DOMAIN: &str = "vampless/commit/v1";
pub const IDENTITY_DOMAIN: &str = "vampless/identity/v1";

pub const FIELD_NAME: u8 = 0x01;
pub const FIELD_TICKER: u8 = 0x02;
pub const FIELD_RAW_IMAGE: u8 = 0x03;
pub const FIELD_PIXEL_IMAGE: u8 = 0x04;

pub fn u32le(n: u32) -> [u8; 4] {
    n.to_le_bytes()
}

pub fn len_bytes(b: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(4 + b.len());
    v.extend_from_slice(&u32le(b.len() as u32));
    v.extend_from_slice(b);
    v
}

pub fn len_str(s: &str) -> Vec<u8> {
    len_bytes(s.as_bytes())
}

/// sha256("vampless/namespace/v1:" ‖ label)
pub fn namespace_id(label: &str) -> [u8; 32] {
    hashv(&[NAMESPACE_DOMAIN.as_bytes(), label.as_bytes()]).to_bytes()
}

/// sha256("vampless/claim/v1" ‖ namespace ‖ field ‖ u32 len ‖ key)
pub fn claim_key_hash(namespace: &[u8; 32], field: u8, key: &[u8]) -> [u8; 32] {
    hashv(&[
        CLAIM_DOMAIN.as_bytes(),
        namespace,
        &[field],
        &u32le(key.len() as u32),
        key,
    ])
    .to_bytes()
}

#[allow(clippy::too_many_arguments)]
pub struct AttestationFields<'a> {
    pub namespace: &'a [u8; 32],
    pub network: &'a str,
    pub policy: &'a str,
    pub pipeline: &'a str,
    pub applicant: &'a [u8; 32],
    pub intended_mint: &'a [u8; 32],
    pub metadata_uri: &'a str,
    pub metadata_digest: &'a [u8; 32],
    pub raw_image_digest: &'a [u8; 32],
    pub pixel_image_digest: &'a [u8; 32],
    pub perceptual_hash: &'a [u8; 8],
    pub nonce: &'a [u8; 32],
    pub signer_key_version: u16,
    pub expiry_slot: u64,
}

/// Mirrors `encodeAttestation` in `attestation.ts`.
pub fn encode_attestation(f: &AttestationFields) -> Vec<u8> {
    let mut v = Vec::with_capacity(400);
    v.extend_from_slice(ATTEST_DOMAIN.as_bytes());
    v.push(1u8);
    v.extend_from_slice(f.namespace);
    v.extend(len_str(f.network));
    v.extend(len_str(f.policy));
    v.extend(len_str(f.pipeline));
    v.extend_from_slice(f.applicant);
    v.extend_from_slice(f.intended_mint);
    v.extend(len_str(f.metadata_uri));
    v.extend_from_slice(f.metadata_digest);
    v.extend_from_slice(f.raw_image_digest);
    v.extend_from_slice(f.pixel_image_digest);
    v.extend_from_slice(f.perceptual_hash);
    v.extend_from_slice(f.nonce);
    v.extend_from_slice(&f.signer_key_version.to_le_bytes());
    v.extend_from_slice(&f.expiry_slot.to_le_bytes());
    v
}

pub struct CommitmentFields<'a> {
    pub namespace: &'a [u8; 32],
    pub policy: &'a str,
    pub applicant: &'a [u8; 32],
    pub intended_mint: &'a [u8; 32],
    pub name_key: &'a str,
    pub ticker_key: &'a str,
    pub raw_image_digest: &'a [u8; 32],
    pub pixel_image_digest: &'a [u8; 32],
    pub metadata_digest: &'a [u8; 32],
    pub salt: &'a [u8; 32],
}

/// Mirrors `computeCommitment` in `commitment.ts`.
pub fn compute_commitment(f: &CommitmentFields) -> [u8; 32] {
    hashv(&[
        COMMIT_DOMAIN.as_bytes(),
        f.namespace,
        &len_str(f.policy),
        f.applicant,
        f.intended_mint,
        &len_str(f.name_key),
        &len_str(f.ticker_key),
        f.raw_image_digest,
        f.pixel_image_digest,
        f.metadata_digest,
        f.salt,
    ])
    .to_bytes()
}

/// Mirrors the identity id derivation in `registry.ts`.
pub fn identity_id(
    namespace: &[u8; 32],
    controller: &[u8; 32],
    name_key: &str,
    ticker_key: &str,
    slot: u64,
    mint_b58: &str,
) -> [u8; 32] {
    hashv(&[
        IDENTITY_DOMAIN.as_bytes(),
        namespace,
        controller,
        &len_str(name_key),
        &len_str(ticker_key),
        &slot.to_le_bytes(),
        mint_b58.as_bytes(),
    ])
    .to_bytes()
}
