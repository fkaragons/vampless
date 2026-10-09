# Vampless — Assessment, Improvements, and Adoption Strategy

Companion to [`Vampless-Protocol-Blueprint.md`](./Vampless-Protocol-Blueprint.md). The blueprint is technically sound and unusually honest about its boundaries. Its weakness is not the protocol; it is the path to the protocol being used. This document records what changes in the implementation and why.

## 1. The adoption problem in the original design

The blueprint's value is only delivered after launchpads agree to a *mandatory* program integration. That ordering has three failure modes:

1. **Cold start.** A registry with zero records protects nobody, so no launchpad gains anything by integrating first.
2. **Integration cost before proof.** Rewiring a launch program to route through a foreign CPI, surrender metadata authority, and depend on an external attester is a multi-week engineering and risk decision. Nobody makes that decision for an unproven protocol.
3. **The strict policy is a hard sell.** "Any one field matches → reject" is correct for the guarantee, but a launchpad that adopts it alone loses creators to competitors that do not.

## 2. The fix: ship the read side first, make enforcement a dial

Vampless becomes useful on day one with zero launchpad cooperation by inverting the build order:

| Phase | What ships | Who uses it | Requires launchpad buy-in? |
| --- | --- | --- | --- |
| **0. Observed index** | Indexer that watches token creation on Solana and fingerprints every name, ticker, and image it sees | Nobody directly; it fills the database | No |
| **1. Check API + badge** | `checkIdentity` and `resolveMint` as a free public API, a drop-in React widget, and an explorer. "This ticker already exists on 14 mints; here's the first one" | Traders, wallets, Telegram/Discord bots, launchpad front-ends (one `fetch` call) | No — soft integration |
| **2. Registered tier** | Creators can *register* an identity through the Vampless program even if their launchpad is not integrated. Registered identities get a verifiable onchain badge | Serious creators who want proof of priority | No |
| **3. Enforced tier** | A launchpad routes launches through the registry CPI. Launches that conflict with a registered identity fail | Launchpads that want to market "no rug-by-impersonation" | Yes, but by now the registry is populated and the API is already in their front-end |
| **4. Shared enforcement** | Second launchpad joins. A reservation on one is honored by the other | Ecosystem | Yes |

Each phase is independently useful, and each one makes the next one cheaper. This is the single most important change relative to the blueprint.

### Policy becomes explicit *tiers*, not one strict switch

The blueprint already says to "keep policy identifiers explicit". We make that a first-class concept:

| Policy ID | Rule | Where it applies |
| --- | --- | --- |
| `observe` | Never rejects. Returns every observed conflict with evidence. | Public API, wallets, explorers |
| `strict-any-v1` | Reject on an unauthorized match of **any** protected field (name, ticker, raw image, pixel image). | Enforced launchpads (the blueprint's policy) |
| `pair-v1` | Reject only if the normalized name **and** ticker both match an existing identity; image conflicts always reject. | Launchpads that want protection without blocking common words |

Every decision, badge, and record names the policy that produced it. A `pair-v1` badge never pretends to be `strict-any-v1`.

## 3. Technical changes relative to the blueprint

### 3.1 Token-2022 metadata extension as the pilot adapter

The blueprint lists Metaplex and Token-2022 as options. We pick **Token-2022 with the `MetadataPointer` + `TokenMetadata` extensions** for the pilot because:

- Metadata lives in the mint account itself; one fewer account to verify.
- The update authority of the metadata can be set to a registry PDA, which is the blueprint's "assign every relevant metadata update authority to a Vampless-controlled authority" requirement with no extra program.
- Metaplex remains a second, separately tested adapter.

### 3.2 Attestations are Ed25519 messages verified via the instructions sysvar

The attester signs a length-delimited, domain-separated message. The program verifies it by introspecting a preceding `Ed25519Program` instruction in the same transaction (the standard Solana pattern), then checks every binding field against the registration instruction. The message format is defined once in `@vampless/core` and mirrored byte-for-byte in the Rust program, with shared test vectors.

### 3.3 Commit–reveal is required only in the enforced tier

A salted commitment protects against front-running the *registration transaction*. In the `observe` and `registered` tiers it is overhead with little benefit, so it is optional there and mandatory in `strict-any-v1` / `pair-v1` enforced launches. Pilot defaults: minimum reveal delay 2 slots, maximum commitment lifetime 1,500 slots (~10 min). Both are config, not constants.

### 3.4 Normalization profile `ascii-v1`

Specified precisely so the SDK and the program agree byte-for-byte:

- Name: Unicode NFKC → trim → collapse internal whitespace to one space → uppercase ASCII → must match `^[A-Z0-9][A-Z0-9 ._-]{0,31}$`.
- Ticker: NFKC → trim → strip a single leading `$` → uppercase → must match `^[A-Z0-9]{1,10}$`.
- Anything else is **rejected**, not silently passed. A separate confusable-skeleton (UTS #39 subset: Cyrillic/Greek lookalikes, digit/letter swaps) is computed *only for review flags* and never for claim keys.

### 3.5 Three image signals, with a decoded-pixel contract

The core library accepts decoded RGBA pixels and never ships its own decoder. Node uses `pngjs` / `jpeg-js`; browsers use `<canvas>`. This keeps the fingerprint math identical across environments and testable with fixed vectors.

- `raw`: SHA-256 of the file bytes.
- `pixel`: SHA-256 of `u32 width ‖ u32 height ‖ RGBA8 pixels` after compositing alpha over a fixed white background, no resampling. Catches re-packaging, not resizing.
- `perceptual`: 64-bit pHash (32×32 grayscale → DCT → top-left 8×8 → median threshold). Hamming distance ≤ 10 is "likely duplicate, review"; it never auto-rejects.

### 3.6 Claim PDAs

```
seeds = ["claim", namespace_id (32 bytes), field_tag (1 byte), sha256(normalized_key) (32 bytes)]
```

Field tags: `0x01` name, `0x02` ticker, `0x03` raw image, `0x04` pixel image. Hashing the key to a fixed length keeps seeds within the 32-byte limit and makes the derivation identical for every field type.

### 3.7 Squatting economics

- Registration deposit returned after N slots if undisputed, forfeited to the dispute pool if a dispute against the registration succeeds.
- Commitment lifetime bounds how long a name can be "soft held" without paying.
- Observed-index priority: a registration whose name/ticker/image was observed on a *different* mint before the registry opened is automatically placed in `needs_review` rather than `registered`.

## 4. What we are explicitly not claiming

Unchanged from the blueprint and repeated in the website and README:

- Vampless cannot prevent a token from being created outside participating programs.
- First registration is not proof of authorship.
- A registry badge is not a safety rating.
- Similarity is not equality; perceptual matches are flags, not verdicts.

## 5. Build order for this repository

1. `@vampless/core` — normalization, policies, fingerprints, claim keys, attestation encoding, in-memory atomic registry. Fully tested. Runs in Node and browsers.
2. `programs/vampless-registry` — Rust program mirroring the core's encoding and policy. Unit-tested on host; SBF build and devnet deploy documented.
3. `services/api` — `checkIdentity`, `attestContent`, `register` (simulated ledger for pilot), `resolveMint`, `submitDispute`, observed-token ingest. SQLite-backed.
4. `apps/web` — public site with a live two-launchpad simulator and explorer built on `@vampless/core`.
