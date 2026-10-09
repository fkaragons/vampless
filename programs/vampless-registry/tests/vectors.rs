//! Cross-implementation test vectors. The expected values were produced by
//! `@vampless/core` (TypeScript). If either side changes its encoding, this
//! test fails — which is the point.

use anchor_lang::solana_program::hash::hash;
use vampless_registry::encoding::*;

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn fill<const N: usize>(v: u8) -> [u8; N] {
    [v; N]
}

#[test]
fn namespace_id_matches_ts() {
    assert_eq!(
        hex(&namespace_id("solana-devnet")),
        "eef2d309e1795bcc221ca42c3c7217a37e8cdddf2b8aa326f4aa55cc5cc6a4bd"
    );
}

#[test]
fn claim_keys_match_ts() {
    let ns = namespace_id("solana-devnet");
    assert_eq!(
        hex(&claim_key_hash(&ns, FIELD_NAME, b"VAMPLESS")),
        "e845b03890ce6189c1821f18fde0d9cd7043b3c64a2e8444a5bb832ae73b469b"
    );
    assert_eq!(
        hex(&claim_key_hash(&ns, FIELD_RAW_IMAGE, &fill::<32>(4))),
        "7b54a45bc78faed08a2686c78fb7e9e6253358d309f89f6cf313eb25455e42b6"
    );
}

#[test]
fn attestation_encoding_matches_ts() {
    let ns = namespace_id("solana-devnet");
    let msg = encode_attestation(&AttestationFields {
        namespace: &ns,
        network: "solana-devnet",
        policy: "strict-any-v1",
        pipeline: "img-v1",
        applicant: &fill::<32>(1),
        intended_mint: &fill::<32>(2),
        metadata_uri: "ipfs://bafyexample/metadata.json",
        metadata_digest: &fill::<32>(3),
        raw_image_digest: &fill::<32>(4),
        pixel_image_digest: &fill::<32>(5),
        perceptual_hash: &fill::<8>(6),
        nonce: &fill::<32>(7),
        signer_key_version: 1,
        expiry_slot: 123_456_789,
    });
    assert_eq!(msg.len(), 341);
    assert_eq!(
        hex(&hash(&msg).to_bytes()),
        "c2f5b7fe906deb416da732be72bdd8f32c4d3a368e273d032f544da80937a1ee"
    );
}

#[test]
fn commitment_matches_ts() {
    let ns = namespace_id("solana-devnet");
    let c = compute_commitment(&CommitmentFields {
        namespace: &ns,
        policy: "strict-any-v1",
        applicant: &fill::<32>(1),
        intended_mint: &fill::<32>(2),
        name_key: "VAMPLESS",
        ticker_key: "VAMP",
        raw_image_digest: &fill::<32>(4),
        pixel_image_digest: &fill::<32>(5),
        metadata_digest: &fill::<32>(3),
        salt: &fill::<32>(9),
    });
    assert_eq!(hex(&c), "fd2f32dd09d6625cfaa12acbc9ab1805a27ec2e1a7d3f11054179d38689e093c");
}
