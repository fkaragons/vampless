<p align="center">
  <img src="apps/web/public/og.svg" alt="Vampless" width="720" />
</p>

<h1 align="center">Vampless</h1>

<p align="center">
  <strong>One name. One ticker. One registry.</strong><br/>
  A shared token identity registry and launch authorization protocol for Solana.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/Vampless-Protocol-Blueprint.md">Blueprint</a> ·
  <a href="docs/01-assessment-and-adoption.md">Assessment &amp; adoption</a> ·
  <a href="#repository-layout">Layout</a> ·
  <a href="#status">Status</a>
</p>

---

Launchpads that integrate Vampless reserve a token's **name**, **ticker** and **image** before completing a launch — atomically, in one transaction. Other integrated launchpads consult the same registry, so a conflicting identity cannot be registered independently somewhere else. A reservation made on one launchpad is honored on every other.

**The guarantee:** within one namespace and policy, each protected name, ticker and exact image fingerprint belongs to at most one active identity.

**The boundary:** tokens created outside participating programs still exist. Vampless shows them as *observed conflicts*; it cannot un-mint them, prove authorship from registration order, or tell you a token is safe to buy.

## What's in this repository

| Path | What it is | Verified by |
| --- | --- | --- |
| [`packages/core`](packages/core) | `@vampless/core` — normalization profile `ascii-v1`, policy engine (`observe`, `pair-v1`, `strict-any-v1`), image fingerprints (raw / pixel / perceptual), claim-key derivation, commit–reveal, Ed25519 attestations, atomic registry. Runs in Node and browsers. | 37 tests, including the blueprint's full §11 acceptance demonstration |
| [`programs/vampless-registry`](programs/vampless-registry) | Anchor program: claim PDAs, commit–reveal, Ed25519 attestation introspection via the instructions sysvar, mint binding, migration, disputes, review flags. | Host unit tests + cross-implementation byte vectors against the TypeScript core |
| [`services/api`](services/api) | Hono + SQLite service: `checkIdentity`, `inspect`, `attestContent`, `register` (pilot ledger), `resolveMint`, identities, observed-token ingest, disputes. | End-to-end HTTP tests (two launchpads, one registry; SQLite atomic rollback) |
| [`apps/web`](apps/web) | Next.js site: protocol overview, **live in-browser demo** running the real core registry with two launchpads, explorer with provenance labels, and the protocol spec. | Production build |
| [`docs/`](docs) | The original blueprint and the assessment that explains what changed and why. | — |

## Quick start

Requirements: Node ≥ 22.12 (tested on 26), npm. Rust/cargo only for the program.

```bash
npm install

# core library
npm test -w @vampless/core

# API (http://localhost:8787) — seeds a few observed tokens for the explorer
npm run seed -w @vampless/api
npm run dev -w @vampless/api

# website (http://localhost:3000)
npm run build -w @vampless/core
npm run dev -w @vampless/web

# Solana program (host tests + cross-impl vectors)
cargo test -p vampless-registry
```

Building the program for SBF and deploying to devnet requires the Solana CLI and Anchor 0.31.x: `anchor keys sync && anchor build && anchor deploy --provider.cluster devnet`.

### API in 30 seconds

```bash
# preflight (reserves nothing)
curl -s localhost:8787/v1/check -H 'content-type: application/json' \
  -d '{"name":"Vampless","ticker":"$VAMP","policy":"strict-any-v1"}'

# fingerprint + attest an image for a specific applicant and mint
curl -s localhost:8787/v1/attest -F image=@logo.png -F applicant=<base58> -F intendedMint=<base58> -F policy=strict-any-v1

# resolve any mint to a registry label
curl -s localhost:8787/v1/resolve/<mint>
```

## How a launch works

1. **Prepare** — creator signs with the controller wallet, picks the intended mint, uploads immutable metadata and image.
2. **Inspect** — service validates format, derives `raw`, `pixel` and `perceptual` fingerprints, checks registered claims and the observed-token index. Reserves nothing.
3. **Commit** — salted commitment over every field, policy, intended mint and controller. Minimum reveal delay and maximum lifetime enforced.
4. **Attest** — the image verifier signs an inspected-content statement bound to applicant, mint, namespace, policy, digests, nonce and expiry.
5. **Register & launch** — the program verifies commitment and attestation, `init`s all four claim PDAs, the identity and the mint binding. Any pre-existing claim fails the whole transaction.
6. **Confirm** — the indexer publishes the identity with observed slot and freshness; explorers resolve the mint to a status.

Full encodings, PDA seeds, instructions, error codes and status labels are on the site's `/spec` page and in [`packages/core/src`](packages/core/src).

## Why this version will actually get used

The blueprint's protocol is sound; its adoption path was not. Value only appeared after launchpads agreed to a *mandatory* integration — a cold-start problem. This implementation inverts the order (see [docs/01-assessment-and-adoption.md](docs/01-assessment-and-adoption.md)):

| Phase | Ships | Needs a launchpad? |
| --- | --- | --- |
| 0 | Observed-token index | no |
| 1 | Free `checkIdentity` / `resolveMint` API, badge, explorer | no |
| 2 | Registered tier — creators register directly on-chain | no |
| 3 | Enforced tier — one launchpad routes launches through the registry | one |
| 4 | Shared enforcement across launchpads | two |

Policies are explicit tiers (`observe`, `pair-v1`, `strict-any-v1`), never mixed under one badge.

## Repository layout

```
.
├── apps/web                      Next.js 16 site (landing, /demo, /explorer, /spec)
├── packages/core                 @vampless/core (TypeScript, zero-native-deps)
├── programs/vampless-registry    Anchor program (Rust)
├── services/api                  Hono API + SQLite store + seed script
├── docs/                         blueprint + assessment
├── Anchor.toml · Cargo.toml      Solana workspace
└── package.json                  npm workspaces
```

## Status

- **v0.1 — pilot.** Proposed design, implemented and tested locally. **Not audited. Not deployed to mainnet.**
- On-chain enforcement covers `strict-any-v1`; `pair-v1` is enforced by the preflight service until conditional claim acquisition lands in the program.
- The program verifies the mint is owned by SPL Token or Token-2022; verification of on-mint metadata fields is delegated to the launchpad adapter in this version (the metadata digest is bound in commitment and attestation).
- The pilot uses a single disclosed attester key. Multiple independent attesters are a later phase.
- WebP decoding is browser-only for now; the Node pipeline accepts PNG and JPEG.

## License

MIT — see [LICENSE](LICENSE).
