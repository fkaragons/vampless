//! Vampless registry program.
//!
//! Owns identity claims, serializes conflicting registrations on claim PDAs,
//! binds identities to mints, verifies image attestations and commit–reveal,
//! and records status transitions (review, dispute, migration).
//!
//! Pilot scope:
//! - Policy `strict-any-v1` is enforced on-chain. `pair-v1` is enforced by the
//!   preflight service only until conditional claim acquisition is added.
//! - The mint must be owned by SPL Token or Token-2022. Verification of the
//!   on-mint metadata fields is delegated to the launchpad adapter in this
//!   version; the metadata digest is bound in the commitment and attestation.

#![allow(clippy::result_large_err)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;

pub mod ed25519;
pub mod encoding;
pub mod errors;
pub mod normalize;
pub mod state;

use encoding::*;
use errors::VamplessError;
use state::*;

declare_id!("54J361BsDqECwVmYCoYxDp8gHrRQsNNF7GKWWHyEc2jD");

pub const SPL_TOKEN_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_2022_ID: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

pub const IMAGE_PIPELINE: &str = "img-v1";

#[program]
pub mod vampless_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        require!(args.attesters.len() <= MAX_ATTESTERS, VamplessError::TooManyAttesters);
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.namespace = namespace_id(&args.namespace_label);
        cfg.namespace_label = args.namespace_label;
        cfg.network = args.network;
        cfg.policy_version = 1;
        cfg.attesters = args.attesters;
        cfg.attester_key_version = 1;
        cfg.min_reveal_delay = args.min_reveal_delay;
        cfg.max_commitment_lifetime = args.max_commitment_lifetime;
        cfg.paused = false;
        cfg.identity_count = 0;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        if let Some(a) = args.attesters {
            require!(a.len() <= MAX_ATTESTERS, VamplessError::TooManyAttesters);
            cfg.attesters = a;
            cfg.attester_key_version = cfg.attester_key_version.saturating_add(1);
        }
        if let Some(p) = args.paused {
            cfg.paused = p;
        }
        if let Some(d) = args.min_reveal_delay {
            cfg.min_reveal_delay = d;
        }
        if let Some(l) = args.max_commitment_lifetime {
            cfg.max_commitment_lifetime = l;
        }
        if let Some(a) = args.authority {
            cfg.authority = a;
        }
        Ok(())
    }

    /// Step 3 of the launch flow: submit a salted commitment to the identity
    /// fields. Reserves nothing; only bounds the later reveal.
    pub fn commit(ctx: Context<Commit>, commitment_hash: [u8; 32], intended_mint: Pubkey, lifetime: u64) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(!cfg.paused, VamplessError::Paused);
        require!(lifetime <= cfg.max_commitment_lifetime, VamplessError::CommitmentLifetimeTooLong);
        let slot = Clock::get()?.slot;
        let c = &mut ctx.accounts.commitment;
        c.namespace = cfg.namespace;
        c.commitment = commitment_hash;
        c.applicant = ctx.accounts.applicant.key();
        c.intended_mint = intended_mint;
        c.created_slot = slot;
        c.expiry_slot = slot.saturating_add(lifetime);
        c.consumed = false;
        c.bump = ctx.bumps.commitment;
        Ok(())
    }

    /// Step 5: validate commitment and attestation, acquire every exact claim,
    /// bind the identity to the mint. All-or-nothing by construction: every
    /// claim account is `init`ed in this instruction, so any pre-existing claim
    /// fails the whole transaction.
    pub fn register(ctx: Context<Register>, args: RegisterArgs) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(!cfg.paused, VamplessError::Paused);
        require!(args.policy == POLICY_STRICT_ANY_V1, VamplessError::PolicyNotEnforced);
        let policy = policy_str(args.policy).ok_or(VamplessError::PolicyNotEnforced)?;
        require!(args.metadata_uri.len() <= MAX_METADATA_URI, VamplessError::MetadataUriTooLong);

        // --- canonical text -------------------------------------------------
        let name = normalize::normalize_name(&args.name).map_err(|_| VamplessError::InvalidName)?;
        let ticker = normalize::normalize_ticker(&args.ticker).map_err(|_| VamplessError::InvalidTicker)?;
        require!(name.display == args.name, VamplessError::NotCanonical);
        require!(ticker.display == args.ticker, VamplessError::NotCanonical);

        // --- mint ownership ------------------------------------------------
        let mint_owner = ctx.accounts.mint.owner;
        require!(*mint_owner == SPL_TOKEN_ID || *mint_owner == TOKEN_2022_ID, VamplessError::MintNotToken);

        let slot = Clock::get()?.slot;
        let controller = ctx.accounts.controller.key();
        let mint = ctx.accounts.mint.key();

        // --- commit–reveal -------------------------------------------------
        {
            let c = &ctx.accounts.commitment;
            require!(!c.consumed, VamplessError::CommitmentConsumed);
            require_keys_eq!(c.intended_mint, mint, VamplessError::CommitmentMismatch);
            require!(slot >= c.created_slot.saturating_add(cfg.min_reveal_delay), VamplessError::RevealTooEarly);
            require!(slot <= c.expiry_slot, VamplessError::CommitmentExpired);
            let expected = compute_commitment(&CommitmentFields {
                namespace: &cfg.namespace,
                policy,
                applicant: &controller.to_bytes(),
                intended_mint: &mint.to_bytes(),
                name_key: &name.key,
                ticker_key: &ticker.key,
                raw_image_digest: &args.raw_image,
                pixel_image_digest: &args.pixel_image,
                metadata_digest: &args.metadata_digest,
                salt: &args.salt,
            });
            require!(expected == c.commitment, VamplessError::CommitmentMismatch);
        }

        // --- attestation ---------------------------------------------------
        {
            let verified = ed25519::load_preceding_ed25519(&ctx.accounts.instructions_sysvar)?;
            let signer = Pubkey::new_from_array(verified.pubkey);
            require!(cfg.attesters.contains(&signer), VamplessError::AttesterNotTrusted);
            require!(args.attestation.expiry_slot > slot, VamplessError::AttestationExpired);
            let expected = encode_attestation(&AttestationFields {
                namespace: &cfg.namespace,
                network: &cfg.network,
                policy,
                pipeline: IMAGE_PIPELINE,
                applicant: &controller.to_bytes(),
                intended_mint: &mint.to_bytes(),
                metadata_uri: &args.metadata_uri,
                metadata_digest: &args.metadata_digest,
                raw_image_digest: &args.raw_image,
                pixel_image_digest: &args.pixel_image,
                perceptual_hash: &args.perceptual,
                nonce: &args.attestation.nonce,
                signer_key_version: args.attestation.signer_key_version,
                expiry_slot: args.attestation.expiry_slot,
            });
            require!(expected == verified.message, VamplessError::AttestationMismatch);
        }

        // --- acquire claims ------------------------------------------------
        let ns = cfg.namespace;
        let identity_key = ctx.accounts.identity.key();
        let fill = |claim: &mut Account<Claim>, field: u8, key: &[u8], bump: u8| {
            claim.namespace = ns;
            claim.field = field;
            claim.key_hash = claim_key_hash(&ns, field, key);
            claim.identity = identity_key;
            claim.slot = slot;
            claim.bump = bump;
        };
        fill(&mut ctx.accounts.name_claim, FIELD_NAME, name.key.as_bytes(), ctx.bumps.name_claim);
        fill(&mut ctx.accounts.ticker_claim, FIELD_TICKER, ticker.key.as_bytes(), ctx.bumps.ticker_claim);
        fill(&mut ctx.accounts.raw_image_claim, FIELD_RAW_IMAGE, &args.raw_image, ctx.bumps.raw_image_claim);
        fill(&mut ctx.accounts.pixel_image_claim, FIELD_PIXEL_IMAGE, &args.pixel_image, ctx.bumps.pixel_image_claim);

        // --- identity + binding --------------------------------------------
        let id = &mut ctx.accounts.identity;
        id.id = identity_id(&ns, &controller.to_bytes(), &name.key, &ticker.key, slot, &mint.to_string());
        id.namespace = ns;
        id.controller = controller;
        id.mint = mint;
        id.name_display = name.display;
        id.ticker_display = ticker.display;
        id.name_key = name.key;
        id.ticker_key = ticker.key;
        id.raw_image = args.raw_image;
        id.pixel_image = args.pixel_image;
        id.perceptual = args.perceptual;
        id.metadata_uri = args.metadata_uri;
        id.metadata_digest = args.metadata_digest;
        id.registered_slot = slot;
        id.policy = args.policy;
        id.status = STATUS_REGISTERED;
        id.open_disputes = 0;
        id.bump = ctx.bumps.identity;

        let b = &mut ctx.accounts.mint_binding;
        b.namespace = ns;
        b.mint = mint;
        b.identity = identity_key;
        b.status = BINDING_ACTIVE;
        b.slot = slot;
        b.bump = ctx.bumps.mint_binding;

        ctx.accounts.commitment.consumed = true;
        ctx.accounts.config.identity_count = ctx.accounts.config.identity_count.saturating_add(1);

        emit!(IdentityRegistered { identity: identity_key, mint, controller, slot, policy: args.policy });
        Ok(())
    }

    /// Controller-authorized migration to a new mint. The old binding becomes
    /// historical; claims stay with the identity so the abandoned mint's name
    /// cannot be immediately reused by someone else.
    pub fn migrate(ctx: Context<Migrate>) -> Result<()> {
        let slot = Clock::get()?.slot;
        let new_mint = ctx.accounts.new_mint.key();
        let owner = ctx.accounts.new_mint.owner;
        require!(*owner == SPL_TOKEN_ID || *owner == TOKEN_2022_ID, VamplessError::MintNotToken);

        ctx.accounts.old_binding.status = BINDING_HISTORICAL;

        let nb = &mut ctx.accounts.new_binding;
        nb.namespace = ctx.accounts.config.namespace;
        nb.mint = new_mint;
        nb.identity = ctx.accounts.identity.key();
        nb.status = BINDING_ACTIVE;
        nb.slot = slot;
        nb.bump = ctx.bumps.new_binding;

        let old_mint = ctx.accounts.identity.mint;
        ctx.accounts.identity.mint = new_mint;
        emit!(IdentityMigrated { identity: ctx.accounts.identity.key(), old_mint, new_mint, slot });
        Ok(())
    }

    pub fn open_dispute(ctx: Context<OpenDispute>, evidence_digest: [u8; 32]) -> Result<()> {
        let slot = Clock::get()?.slot;
        let d = &mut ctx.accounts.dispute;
        d.namespace = ctx.accounts.config.namespace;
        d.identity = ctx.accounts.identity.key();
        d.claimant = ctx.accounts.claimant.key();
        d.evidence_digest = evidence_digest;
        d.opened_slot = slot;
        d.status = DISPUTE_OPEN;
        d.resolved_slot = 0;
        d.bump = ctx.bumps.dispute;

        let id = &mut ctx.accounts.identity;
        require!(id.status != STATUS_HISTORICAL, VamplessError::WrongStatus);
        id.open_disputes = id.open_disputes.saturating_add(1);
        id.status = STATUS_DISPUTED;
        emit!(DisputeOpened { identity: id.key(), dispute: d.key(), claimant: d.claimant, slot });
        Ok(())
    }

    /// Governance authority resolves a dispute. Upholding marks the identity
    /// and its binding historical; it never transfers or freezes tokens.
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, upheld: bool) -> Result<()> {
        let slot = Clock::get()?.slot;
        let d = &mut ctx.accounts.dispute;
        require!(d.status == DISPUTE_OPEN, VamplessError::DisputeNotOpen);
        d.status = if upheld { DISPUTE_UPHELD } else { DISPUTE_REJECTED };
        d.resolved_slot = slot;

        let id = &mut ctx.accounts.identity;
        id.open_disputes = id.open_disputes.saturating_sub(1);
        if upheld {
            id.status = STATUS_HISTORICAL;
            ctx.accounts.binding.status = BINDING_HISTORICAL;
        } else if id.open_disputes == 0 {
            id.status = STATUS_REGISTERED;
        }
        emit!(DisputeResolved { identity: id.key(), dispute: d.key(), upheld, slot });
        Ok(())
    }

    /// Governance authority toggles the review flag (e.g. after an observed
    /// index collision is adjudicated).
    pub fn set_review(ctx: Context<SetReview>, needs_review: bool) -> Result<()> {
        let id = &mut ctx.accounts.identity;
        require!(id.status == STATUS_REGISTERED || id.status == STATUS_NEEDS_REVIEW, VamplessError::WrongStatus);
        id.status = if needs_review { STATUS_NEEDS_REVIEW } else { STATUS_REGISTERED };
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Instruction args
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeArgs {
    pub namespace_label: String,
    pub network: String,
    pub attesters: Vec<Pubkey>,
    pub min_reveal_delay: u64,
    pub max_commitment_lifetime: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateConfigArgs {
    pub attesters: Option<Vec<Pubkey>>,
    pub paused: Option<bool>,
    pub min_reveal_delay: Option<u64>,
    pub max_commitment_lifetime: Option<u64>,
    pub authority: Option<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AttestationArgs {
    pub nonce: [u8; 32],
    pub signer_key_version: u16,
    pub expiry_slot: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterArgs {
    pub policy: u8,
    /// Canonical display forms (already normalized client-side; re-validated).
    pub name: String,
    pub ticker: String,
    pub raw_image: [u8; 32],
    pub pixel_image: [u8; 32],
    pub perceptual: [u8; 8],
    pub metadata_uri: String,
    pub metadata_digest: [u8; 32],
    pub salt: [u8; 32],
    pub attestation: AttestationArgs,
}

// ---------------------------------------------------------------------------
// Seed helpers (used inside account constraints)
// ---------------------------------------------------------------------------

pub fn name_claim_hash(ns: &[u8; 32], name: &str) -> [u8; 32] {
    match normalize::normalize_name(name) {
        Ok(n) => claim_key_hash(ns, FIELD_NAME, n.key.as_bytes()),
        Err(_) => [0u8; 32],
    }
}

pub fn ticker_claim_hash(ns: &[u8; 32], ticker: &str) -> [u8; 32] {
    match normalize::normalize_ticker(ticker) {
        Ok(n) => claim_key_hash(ns, FIELD_TICKER, n.key.as_bytes()),
        Err(_) => [0u8; 32],
    }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(args: InitializeArgs)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + RegistryConfig::INIT_SPACE,
        seeds = [b"config".as_ref(), namespace_id(&args.namespace_label).as_ref()],
        bump
    )]
    pub config: Account<'info, RegistryConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority @ VamplessError::Unauthorized)]
    pub config: Account<'info, RegistryConfig>,
}

#[derive(Accounts)]
#[instruction(commitment_hash: [u8; 32])]
pub struct Commit<'info> {
    #[account(mut)]
    pub applicant: Signer<'info>,
    pub config: Account<'info, RegistryConfig>,
    #[account(
        init,
        payer = applicant,
        space = 8 + Commitment::INIT_SPACE,
        seeds = [b"commitment", config.namespace.as_ref(), commitment_hash.as_ref()],
        bump
    )]
    pub commitment: Account<'info, Commitment>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: RegisterArgs)]
pub struct Register<'info> {
    #[account(mut)]
    pub controller: Signer<'info>,
    #[account(mut)]
    pub config: Account<'info, RegistryConfig>,
    /// The commitment's applicant must be the controller signing now.
    #[account(
        mut,
        constraint = commitment.applicant == controller.key() @ VamplessError::CommitmentMismatch,
        seeds = [b"commitment", config.namespace.as_ref(), commitment.commitment.as_ref()],
        bump = commitment.bump
    )]
    pub commitment: Account<'info, Commitment>,
    /// CHECK: ownership by a token program is verified in the handler.
    pub mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = controller,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", config.namespace.as_ref(), &[FIELD_NAME], &name_claim_hash(&config.namespace, &args.name)],
        bump
    )]
    pub name_claim: Account<'info, Claim>,
    #[account(
        init,
        payer = controller,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", config.namespace.as_ref(), &[FIELD_TICKER], &ticker_claim_hash(&config.namespace, &args.ticker)],
        bump
    )]
    pub ticker_claim: Account<'info, Claim>,
    #[account(
        init,
        payer = controller,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", config.namespace.as_ref(), &[FIELD_RAW_IMAGE], &claim_key_hash(&config.namespace, FIELD_RAW_IMAGE, &args.raw_image)],
        bump
    )]
    pub raw_image_claim: Account<'info, Claim>,
    #[account(
        init,
        payer = controller,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", config.namespace.as_ref(), &[FIELD_PIXEL_IMAGE], &claim_key_hash(&config.namespace, FIELD_PIXEL_IMAGE, &args.pixel_image)],
        bump
    )]
    pub pixel_image_claim: Account<'info, Claim>,

    #[account(
        init,
        payer = controller,
        space = 8 + Identity::INIT_SPACE,
        seeds = [b"identity", config.namespace.as_ref(), commitment.key().as_ref()],
        bump
    )]
    pub identity: Account<'info, Identity>,
    #[account(
        init,
        payer = controller,
        space = 8 + MintBinding::INIT_SPACE,
        seeds = [b"mint", config.namespace.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub mint_binding: Account<'info, MintBinding>,

    /// CHECK: address constraint pins this to the instructions sysvar.
    #[account(address = sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Migrate<'info> {
    #[account(mut)]
    pub controller: Signer<'info>,
    pub config: Account<'info, RegistryConfig>,
    #[account(mut, has_one = controller @ VamplessError::Unauthorized)]
    pub identity: Account<'info, Identity>,
    #[account(
        mut,
        seeds = [b"mint", config.namespace.as_ref(), identity.mint.as_ref()],
        bump = old_binding.bump
    )]
    pub old_binding: Account<'info, MintBinding>,
    /// CHECK: ownership verified in handler.
    pub new_mint: UncheckedAccount<'info>,
    #[account(
        init,
        payer = controller,
        space = 8 + MintBinding::INIT_SPACE,
        seeds = [b"mint", config.namespace.as_ref(), new_mint.key().as_ref()],
        bump
    )]
    pub new_binding: Account<'info, MintBinding>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(evidence_digest: [u8; 32])]
pub struct OpenDispute<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    pub config: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub identity: Account<'info, Identity>,
    #[account(
        init,
        payer = claimant,
        space = 8 + Dispute::INIT_SPACE,
        seeds = [b"dispute", config.namespace.as_ref(), identity.key().as_ref(), evidence_digest.as_ref()],
        bump
    )]
    pub dispute: Account<'info, Dispute>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    pub authority: Signer<'info>,
    #[account(has_one = authority @ VamplessError::Unauthorized)]
    pub config: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub identity: Account<'info, Identity>,
    #[account(mut, has_one = identity)]
    pub dispute: Account<'info, Dispute>,
    #[account(
        mut,
        seeds = [b"mint", config.namespace.as_ref(), identity.mint.as_ref()],
        bump = binding.bump
    )]
    pub binding: Account<'info, MintBinding>,
}

#[derive(Accounts)]
pub struct SetReview<'info> {
    pub authority: Signer<'info>,
    #[account(has_one = authority @ VamplessError::Unauthorized)]
    pub config: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub identity: Account<'info, Identity>,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct IdentityRegistered {
    pub identity: Pubkey,
    pub mint: Pubkey,
    pub controller: Pubkey,
    pub slot: u64,
    pub policy: u8,
}

#[event]
pub struct IdentityMigrated {
    pub identity: Pubkey,
    pub old_mint: Pubkey,
    pub new_mint: Pubkey,
    pub slot: u64,
}

#[event]
pub struct DisputeOpened {
    pub identity: Pubkey,
    pub dispute: Pubkey,
    pub claimant: Pubkey,
    pub slot: u64,
}

#[event]
pub struct DisputeResolved {
    pub identity: Pubkey,
    pub dispute: Pubkey,
    pub upheld: bool,
    pub slot: u64,
}
