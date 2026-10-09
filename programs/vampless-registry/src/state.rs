use anchor_lang::prelude::*;

pub const MAX_ATTESTERS: usize = 4;
pub const MAX_METADATA_URI: usize = 200;

/// Policy identifiers enforceable on-chain. Must match the policy strings in
/// `@vampless/core` because they are part of the attestation and commitment
/// encodings.
pub const POLICY_STRICT_ANY_V1: u8 = 1;
pub const POLICY_PAIR_V1: u8 = 2;

pub fn policy_str(p: u8) -> Option<&'static str> {
    match p {
        POLICY_STRICT_ANY_V1 => Some("strict-any-v1"),
        POLICY_PAIR_V1 => Some("pair-v1"),
        _ => None,
    }
}

pub const STATUS_REGISTERED: u8 = 0;
pub const STATUS_NEEDS_REVIEW: u8 = 1;
pub const STATUS_DISPUTED: u8 = 2;
pub const STATUS_HISTORICAL: u8 = 3;

pub const BINDING_ACTIVE: u8 = 0;
pub const BINDING_HISTORICAL: u8 = 1;

pub const DISPUTE_OPEN: u8 = 0;
pub const DISPUTE_UPHELD: u8 = 1;
pub const DISPUTE_REJECTED: u8 = 2;

#[account]
#[derive(InitSpace)]
pub struct RegistryConfig {
    pub authority: Pubkey,
    pub namespace: [u8; 32],
    #[max_len(32)]
    pub namespace_label: String,
    #[max_len(32)]
    pub network: String,
    pub policy_version: u16,
    #[max_len(MAX_ATTESTERS)]
    pub attesters: Vec<Pubkey>,
    pub attester_key_version: u16,
    pub min_reveal_delay: u64,
    pub max_commitment_lifetime: u64,
    pub paused: bool,
    pub identity_count: u64,
    pub bump: u8,
}

/// One protected field → one claim account. Existence of the account *is* the
/// reservation; the runtime serializes contention on it.
#[account]
#[derive(InitSpace)]
pub struct Claim {
    pub namespace: [u8; 32],
    pub field: u8,
    pub key_hash: [u8; 32],
    pub identity: Pubkey,
    pub slot: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Identity {
    /// Cross-implementation identity id (see `encoding::identity_id`).
    pub id: [u8; 32],
    pub namespace: [u8; 32],
    pub controller: Pubkey,
    pub mint: Pubkey,
    #[max_len(32)]
    pub name_display: String,
    #[max_len(10)]
    pub ticker_display: String,
    #[max_len(32)]
    pub name_key: String,
    #[max_len(10)]
    pub ticker_key: String,
    pub raw_image: [u8; 32],
    pub pixel_image: [u8; 32],
    pub perceptual: [u8; 8],
    #[max_len(MAX_METADATA_URI)]
    pub metadata_uri: String,
    pub metadata_digest: [u8; 32],
    pub registered_slot: u64,
    pub policy: u8,
    pub status: u8,
    pub open_disputes: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MintBinding {
    pub namespace: [u8; 32],
    pub mint: Pubkey,
    pub identity: Pubkey,
    pub status: u8,
    pub slot: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Commitment {
    pub namespace: [u8; 32],
    pub commitment: [u8; 32],
    pub applicant: Pubkey,
    pub intended_mint: Pubkey,
    pub created_slot: u64,
    pub expiry_slot: u64,
    pub consumed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Dispute {
    pub namespace: [u8; 32],
    pub identity: Pubkey,
    pub claimant: Pubkey,
    pub evidence_digest: [u8; 32],
    pub opened_slot: u64,
    pub status: u8,
    pub resolved_slot: u64,
    pub bump: u8,
}
