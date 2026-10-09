//! Ed25519 signature verification via instruction introspection.
//!
//! Solana programs cannot verify Ed25519 signatures directly within the
//! compute budget, so the transaction includes an `Ed25519Program`
//! instruction immediately before the registry instruction. The runtime
//! verifies the signature; this module confirms that the verified
//! (pubkey, message) pair is exactly what the registry expects.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};

use crate::errors::VamplessError;

/// Layout constants from the Ed25519 program.
const SIGNATURE_OFFSETS_SERIALIZED_SIZE: usize = 14;
const SIGNATURE_OFFSETS_START: usize = 2;
const PUBKEY_LEN: usize = 32;
const SIGNATURE_LEN: usize = 64;

pub struct VerifiedEd25519 {
    pub pubkey: [u8; 32],
    pub message: Vec<u8>,
}

/// Loads the instruction at `current_index - 1`, checks that it is an
/// Ed25519Program instruction with exactly one signature whose pubkey and
/// message are embedded in the same instruction, and returns them.
pub fn load_preceding_ed25519(instructions_sysvar: &AccountInfo) -> Result<VerifiedEd25519> {
    let current = load_current_index_checked(instructions_sysvar)? as usize;
    require!(current > 0, VamplessError::AttestationMissing);
    let ix = load_instruction_at_checked(current - 1, instructions_sysvar)?;
    require_keys_eq!(ix.program_id, ed25519_program::ID, VamplessError::AttestationMissing);
    require!(ix.accounts.is_empty(), VamplessError::AttestationMalformed);

    let data = &ix.data;
    require!(data.len() >= SIGNATURE_OFFSETS_START + SIGNATURE_OFFSETS_SERIALIZED_SIZE, VamplessError::AttestationMalformed);
    let num_signatures = data[0];
    require!(num_signatures == 1, VamplessError::AttestationMalformed);

    let off = |i: usize| -> usize { u16::from_le_bytes([data[SIGNATURE_OFFSETS_START + i], data[SIGNATURE_OFFSETS_START + i + 1]]) as usize };
    let signature_offset = off(0);
    let signature_ix_index = off(2);
    let pubkey_offset = off(4);
    let pubkey_ix_index = off(6);
    let message_offset = off(8);
    let message_size = off(10);
    let message_ix_index = off(12);

    // All references must point at this same instruction (u16::MAX = current).
    for idx in [signature_ix_index, pubkey_ix_index, message_ix_index] {
        require!(idx == u16::MAX as usize || idx == current - 1, VamplessError::AttestationMalformed);
    }
    require!(signature_offset + SIGNATURE_LEN <= data.len(), VamplessError::AttestationMalformed);
    require!(pubkey_offset + PUBKEY_LEN <= data.len(), VamplessError::AttestationMalformed);
    require!(message_offset + message_size <= data.len(), VamplessError::AttestationMalformed);

    let mut pubkey = [0u8; 32];
    pubkey.copy_from_slice(&data[pubkey_offset..pubkey_offset + PUBKEY_LEN]);
    let message = data[message_offset..message_offset + message_size].to_vec();
    Ok(VerifiedEd25519 { pubkey, message })
}
