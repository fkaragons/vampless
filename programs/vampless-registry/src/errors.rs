use anchor_lang::prelude::*;

#[error_code]
pub enum VamplessError {
    #[msg("Registry is paused")]
    Paused,
    #[msg("Unauthorized authority")]
    Unauthorized,
    #[msg("Policy is not enforceable on-chain")]
    PolicyNotEnforced,
    #[msg("Name is invalid under profile ascii-v1")]
    InvalidName,
    #[msg("Ticker is invalid under profile ascii-v1")]
    InvalidTicker,
    #[msg("Submitted display form is not canonical; normalize client-side first")]
    NotCanonical,
    #[msg("Metadata URI too long")]
    MetadataUriTooLong,
    #[msg("Name already claimed")]
    NameClaimed,
    #[msg("Ticker already claimed")]
    TickerClaimed,
    #[msg("Image file already claimed")]
    RawImageClaimed,
    #[msg("Image pixels already claimed")]
    PixelImageClaimed,
    #[msg("Mint is already bound to an identity")]
    MintAlreadyBound,
    #[msg("Mint account is not owned by a token program")]
    MintNotToken,
    #[msg("Commitment is consumed")]
    CommitmentConsumed,
    #[msg("Reveal too early")]
    RevealTooEarly,
    #[msg("Commitment expired")]
    CommitmentExpired,
    #[msg("Commitment does not match revealed fields")]
    CommitmentMismatch,
    #[msg("Commitment lifetime exceeds the configured maximum")]
    CommitmentLifetimeTooLong,
    #[msg("Image attestation instruction missing")]
    AttestationMissing,
    #[msg("Image attestation instruction malformed")]
    AttestationMalformed,
    #[msg("Attester key is not trusted")]
    AttesterNotTrusted,
    #[msg("Attestation message does not match registration")]
    AttestationMismatch,
    #[msg("Attestation expired")]
    AttestationExpired,
    #[msg("Identity is not in the expected status")]
    WrongStatus,
    #[msg("Too many attesters")]
    TooManyAttesters,
    #[msg("Dispute is not open")]
    DisputeNotOpen,
}
