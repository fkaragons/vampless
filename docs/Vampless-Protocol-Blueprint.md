# Vampless — Protocol Blueprint

Version 0.1 · September 26, 2026 · Proposed design

Vampless is a shared token identity registry and launch authorization protocol. Participating launchpads reserve a token's name, ticker, and image identity before completing its launch. Other participants consult the same registry, so a conflicting identity cannot be registered independently on a second integrated launchpad.

This document defines a starting architecture. It is not an implemented, deployed, or audited protocol. Solana is the proposed first chain because it is the user's example; other chains are a later phase.

**The guarantee to build:** within one Vampless namespace and policy, each protected name, ticker, and exact image fingerprint can belong to at most one active identity, except for explicitly authorized representations of that identity. This guarantee depends on correct programs, mandatory integration, and trustworthy image attestations.

**The boundary:** tokens created outside participating programs can still exist. Vampless cannot prove authorship from registration order, prevent every visual imitation, or establish that a registered token is safe to buy.

## 1. Where enforcement happens

Solana identifies a token by its mint address. Creating a typical token creates a mint under a token program; it does not require deploying a separate token program. Its name, ticker, and metadata do not serve as globally exclusive identifiers. See [Solana's token model](https://solana.com/docs/tokens) and [metadata documentation](https://solana.com/docs/tokens/extensions/metadata).

The architectural consequence is that deploying Vampless alone cannot make unrelated token creation instructions consult it. An attacker can bypass a voluntary registry by using another creation path.

| Integration | Enforceable behavior | Remaining boundary |
| --- | --- | --- |
| Launchpad website check | Warn or block in that website | Direct program calls can bypass the website |
| Mandatory launchpad program integration | Reject conflicting launches through that program | Other programs remain available |
| Several programs sharing one registry | Reject conflicts across all participating programs | Coverage depends on adoption |
| Wallet, explorer, or trading application | Show registry status, flag conflicts, or filter listings | Does not prevent the underlying token from existing or trading elsewhere |
| Blockchain changes | Could require registry checks for explicitly defined asset creation and metadata operations | Requires network adoption and comprehensive rules; arbitrary programs and externally displayed images make universal semantic enforcement much harder |

Start with launchpads. A Token-2022 transfer hook is not a network-wide deployment filter: it operates on transfers of a mint configured to use it. See the [official transfer hook guide](https://solana.com/developers/guides/token-extensions/transfer-hook).

## 2. Initial uniqueness policy

The proposed strict policy follows the user's requested restriction: an unauthorized match on **any one** protected field is sufficient to reject registration. Do not silently implement only a match on all three together.

| Submitted identity | Strict policy result |
| --- | --- |
| Same normalized name, different ticker and image | Reject: name already claimed |
| Different name, same normalized ticker | Reject: ticker already claimed |
| Different name and ticker, same image bytes | Reject: image already claimed |
| Same decoded pixels, different file packaging | Reject when the canonical pixel fingerprint matches |
| Altered image that looks similar | Flag for review; similarity alone is not cryptographic equality |
| All protected fields new | Eligible for registration, subject to final onchain checks |
| Owner-authorized migration or additional chain representation | Link to the existing identity through a dedicated authorization path |

Strict ticker and name exclusivity will also block innocent overlaps, including unrelated projects using common words or short symbols. That is a product policy consequence, not a software defect. An alternative policy could reserve the name–ticker pair, but it would provide a weaker, different guarantee. Keep policy identifiers explicit; never mix policies under one ambiguous badge.

For the pilot, use a single shared namespace per Solana network. Devnet records never reserve mainnet names. Global uniqueness across chains requires an additional coordination design.

## 3. Components

| Component | Responsibility |
| --- | --- |
| Solana registry program | Own claims, serialize conflicting registrations, bind identities to mints, verify authorized signatures, record status |
| Launchpad adapter | Require registry authorization for each launch; prevent direct-call bypass within that launchpad |
| Image verification service | Fetch approved assets, compute fingerprints, inspect similarity, and sign statements about inspected content |
| Indexer and search API | Build searchable views of registry records and observed tokens; expose freshness and coverage |
| Integration SDK | Prepare transactions, calculate claim addresses, decode errors, and verify returned records |
| Public explorer | Show identity, actual mint address, claim history, policy, and disputes |

The pilot can use an explicitly identified image attester. This creates trust and availability dependencies. Multiple independent attesters can reduce reliance on one operator later, but a quorum does not automatically prove an image comparison correct.

## 4. Text and image matching

For an initial prototype, use a documented, restricted ASCII name/ticker profile that can be validated identically in the program and SDK. Normalize letter case, trim surrounding spaces, and collapse permitted internal spaces. Reject unsupported characters rather than allowing them to bypass checks. Set length limits to fit the selected metadata adapter. This intentionally limits international names in the prototype.

Production support for international names needs a versioned Unicode normalization policy, reproducible test vectors, and either program-side validation or an explicit attestation dependency. Keep visual confusable detection separate from canonical identity. For example, replacing a Latin letter with a Cyrillic lookalike can merit review even when the normalized strings differ. [Unicode UTS #39](https://www.unicode.org/reports/tr39/) defines confusable detection; its skeletons are not display names and must not silently redefine existing claims after a Unicode update.

Maintain three different image signals:

1. **Raw SHA-256 digest:** fingerprints the complete downloaded file, independent of filename or hosting URL.
2. **Canonical pixel digest:** fingerprints dimensions and decoded pixels under a fixed decoder, orientation, color, and alpha policy. It can recognize equivalent pixels in differently packaged files. Do not claim it handles every re-encoding or resize.
3. **Perceptual fingerprint:** finds likely visual duplicates for review. Evaluate pHash or PDQ against a representative token-logo dataset, including resizes, JPEG recompression, crops, borders, mirrors, text overlays, and unrelated logos. [Meta's PDQ documentation](https://github.com/facebook/ThreatExchange/blob/main/pdq/README.md) supplies an existing algorithm to evaluate.

Similarity thresholds produce false positives and false negatives. Avoid a universal “AI says duplicate” veto in the first release. Review results must include evidence and an appeal path. Concurrent or stale similarity searches do not provide the same atomic guarantee as exact claim locks.

Do not hash only the image URL or compare only IPFS CID strings. Identical files can have different CIDs under different import settings. Compute the actual content fingerprints; [IPFS documents these distinctions](https://docs.ipfs.tech/concepts/content-addressing/).

Use immutable, content-addressed references for both metadata JSON and its image, with persistence arrangements. A fixed JSON URL that points to a mutable image is insufficient. Restrict the prototype to supported static raster formats; reject unsupported animation, SVG, and oversized payloads until their comparison semantics are defined.

## 5. Registry records and atomic claims

Proposed records:

| Record | Core contents |
| --- | --- |
| Registry configuration | Namespace, policy version, attester keys, governance authority, supported adapters |
| Identity | Identity ID, controller, mint/network binding, display fields, normalized keys, content digests, metadata commitment, registration slot, status |
| Name claim | Normalized name key → identity |
| Ticker claim | Normalized ticker key → identity |
| Raw image claim | File digest → identity |
| Pixel image claim | Canonical pixel digest → identity |
| Commitment | Applicant, salted commitment, intended mint, creation slot, expiry, consumption state |
| History or dispute record | Affected identity, evidence commitment, decision, responsible authority, effective slot |

On Solana, use deterministic program-derived addresses for individual claims, conceptually seeded by namespace, field type, and a fixed-length digest. [PDAs](https://solana.com/docs/core/pda) provide deterministic addresses controlled by a program. Domain-separate field types and use unambiguous, length-delimited encoding before hashing.

Keep distinct name, ticker, and image claim records. A single hash of name + ticker + image would allow an attacker to change one field and reuse the others.

All claim acquisition and identity binding must succeed or fail together. Two concurrent requests for the same claim must contend on the same program-owned account; checking an offchain database first is insufficient. Solana [transactions are atomic](https://solana.com/docs/core/transactions), which supports this design. Registry entries remain authoritative when the indexer lags.

Version migrations must check or migrate existing reservations. A new normalization version must not create a fresh, empty space in which old protected names become claimable again.

## 6. Launch flow

1. **Prepare.** The creator signs with the intended controller wallet, selects an intended mint, and uploads immutable metadata and image content.
2. **Inspect.** The service validates formats, derives fingerprints, checks registered conflicts and the observed-token index, and returns explicit reasons. This preflight does not reserve anything.
3. **Commit.** The creator submits a salted commitment binding the identity fields, network, registry, policy, intended mint, controller, metadata commitment, and image digests. Enforce a minimum reveal delay and maximum commitment lifetime. These parameters need pilot measurements.
4. **Attest.** The image verifier signs the inspected-content statement for that applicant and intended mint. The statement includes registry and network identifiers, policy/pipeline versions, exact metadata URI and content digests, nonce, signer-key version, and expiry. The program verifies both signature and every binding; a creator-provided digest by itself is not evidence.
5. **Register and launch.** The integrated program validates the commitment and attestation, acquires every exact claim, creates or verifies the mint and metadata through a supported adapter, and binds the identity. It verifies actual account ownership, addresses, signatures, and metadata fields. A conflict causes the launch transaction to fail.
6. **Confirm.** The application reports pending until its declared confirmation policy is met. The indexer publishes the identity and mint binding with the observed slot and freshness.

Prefer a single transaction for final registration, mint/metadata initialization, and the launchpad's launch operation. Verify compute, account, and transaction-size limits in a prototype. If an integration needs staging, it must enforce an explicit reserved → finalized transition, expiration and recovery rules, and prohibit launch completion before registry finalization. A loosely coordinated series of API calls does not provide atomic launch enforcement.

Commit–reveal reduces opportunistic copying of a disclosed registration transaction. It does not establish authorship, stop someone independently registering an already-public brand, or guarantee that an image attester cannot leak a submitted design. A commitment hides the fields; it does not automatically reserve their unseen names.

## 7. Preventing post-launch substitution

A token could pass inspection and later change its name, ticker, or image. The metadata path must therefore be part of the integration.

For newly launched pilot tokens, require immutable protected metadata and immutable image references. Alternatively, assign every relevant metadata update and pointer authority to a Vampless-controlled program authority, and permit updates only through conflict checks. Do not leave an independent creator-controlled update route that bypasses the registry. Metaplex [documents mutable name, symbol, and URI fields](https://www.metaplex.com/docs/smart-contracts/token-metadata/update); Token-2022 also has metadata and pointer authorities.

Keep old claims as historical reservations after a rebrand or migration so an abandoned identity cannot immediately be reused to impersonate its previous token. A migration links an explicitly authorized new mint and marks the old binding as historical; it does not silently erase history.

This authority design concerns identity metadata. It does not inherently require Vampless to custody tokens, freeze transfers, or control supply.

## 8. Existing tokens, squatting, and disputes

An empty registry would let attackers register the identities of projects that existed before Vampless. Before opening registration, build an observed-token index, record the coverage interval and missing data, and route historical collisions to review. Earlier onchain observations can support a claim, but do not prove creative authorship or legal ownership.

Require evidence appropriate to the token: a current controlling authority signature where available, public project attestations, or a documented review process. Owning some tokens is not proof of authority over the project. Tokens whose authorities were revoked may need alternative evidence.

Use distinct labels:

- **Registered:** a particular mint is bound to a registry identity under a stated policy.
- **Observed conflict:** another token shares a protected field; intent has not been established.
- **Disputed:** a claim is under a documented challenge.
- **Historical:** the record remains available after an authorized migration or change.

Do not turn “first registered” into “verified original,” and do not label every unregistered token a scam.

Fees, refundable deposits, limited commitment lifetimes, and actual-mint binding can make mass squatting more expensive. Wallet-based limits alone are weak because applicants can create new wallets. No fee rule eliminates squatting. Published dispute rules and transparent, accountable decisions are part of the product.

In the pilot, use an explicitly disclosed multisignature authority for upgrades, signer rotation, and adjudication, with delayed ordinary changes and narrowly defined emergency powers. Appeals change registry status or claim assignment according to policy; they do not erase arbitrary blockchain tokens. Do not grant reviewers unrestricted asset-transfer authority.

## 9. Launchpad and application interfaces

Suggested interfaces are design placeholders, not existing endpoints or an SDK:

| Interface | Result |
| --- | --- |
| `checkIdentity` | Available, conflict, needs review, or indeterminate; matched fields; relevant mints; policy; index freshness |
| `prepareCommitment` | Wallet-bound transaction data and commitment inputs |
| `attestContent` | Signed inspected-content statement or a reason it cannot be issued |
| `registerAndLaunch` | Program-enforced finalization through the launchpad adapter |
| `resolveMint` | Registry identity and current/historical binding for a network and mint |
| `submitDispute` | Evidence submission and a traceable case reference |

Every consumer must verify the configured registry program and the actual network/mint. A badge drawn inside a token image is not a verifiable registry credential. Public lookup should expose reason codes and distinguish unavailable data from confirmed absence.

When verification is unavailable, integrated strict launches pause or fail with a clear retry state. They must not silently bypass verification. Previously launched tokens continue to exist and transfer independently of an API outage.

## 10. More than one blockchain

Deploying one isolated registry on each chain produces per-chain uniqueness, not global uniqueness. Two chains could approve the same new name before either sees the other's registration.

A later global design should choose one authoritative registry that orders reservations, then deliver finalized proofs or attestations to destination-chain adapters. Destination mint bindings must be authorized by the identity controller. Define finality, replay protection, proof expiry, bridge or attester trust, and behavior during outages before claiming global enforcement.

Use one logical identity with explicit authorized representations on different chains. Chain-local copied metadata never suffices to prove that an additional deployment is legitimate.

## 11. Build sequence and acceptance gates

| Stage | Deliverable | Evidence required |
| --- | --- | --- |
| Policy prototype | Normalization profile, sample decisions, image corpus, historical conflict examples | Product decisions are explicit; matching errors measured |
| Registry prototype | Claims, commit–reveal, signature binding, identity records | Concurrent exact duplicates cannot both finalize |
| One launchpad integration | Mandatory program call, metadata binding, content verifier, basic SDK | Direct calls cannot bypass checks within the integrated program |
| Pilot explorer | Mint resolution, provenance labels, coverage and dispute history | Users can distinguish registered, disputed, historical, and unknown |
| Production preparation | Recovery procedures, performance measurements, independent security review | Known launch and authority bypasses resolved before protecting real launches |
| Broader adoption | Additional launchpads and read integrations | Different partners enforce the same namespace and policy |

The first demonstration should launch one test identity, then reject a duplicate from a second wallet. It should independently test name-only, ticker-only, identical-file, and equivalent-pixel conflicts; reject reused or wrongly bound attestations; reject metadata substitution; and prove that a changed image gets an appropriate similarity result rather than a false guarantee.

Also demonstrate an external deployment bypassing the registry and being shown as an observed conflict. This verifies the real coverage boundary instead of hiding it.

Suggested implementation shape: a Rust Solana program, a TypeScript integration SDK and service, a durable database for searchable views, and a dedicated image-processing worker. Pin tool and library versions when implementation starts. Support the first launchpad's actual token standard, then add separately tested adapters for others. The design does not require a new blockchain or a native Vampless token.

**First milestone:** prove mandatory duplicate rejection through one launchpad, with a shared registry and a verifiable mint identity. Adoption by a second launchpad then demonstrates the protocol's central value: a reservation made in one place is honored in another.
