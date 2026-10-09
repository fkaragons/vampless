import type { Metadata } from "next";
import { Badge, Eyebrow } from "@/components/ui";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Spec — Vampless",
  description: "Vampless protocol reference: normalization profile, claim derivation, attestation and commitment encodings, program accounts, API surface and error codes.",
};

const toc = [
  ["normalization", "Normalization ascii-v1"],
  ["claims", "Claim derivation"],
  ["images", "Image pipeline img-v1"],
  ["attestation", "Attestation encoding"],
  ["commitment", "Commit–reveal"],
  ["program", "Program accounts & instructions"],
  ["api", "API surface"],
  ["errors", "Error codes"],
  ["status", "Status labels"],
];

export default function SpecPage() {
  return (
    <main className="mx-auto max-w-7xl px-5 pb-10 pt-10 md:pt-14">
      <Eyebrow>Specification · v0.1 · pilot</Eyebrow>
      <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight md:text-5xl">Protocol reference</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Everything that hashes is specified once here and implemented twice: in <code className="mono text-fg/80">@vampless/core</code> (TypeScript) and in the Anchor program (Rust). Cross-implementation vectors in{" "}
        <a href={`${GITHUB_URL}/blob/main/programs/vampless-registry/tests/vectors.rs`} className="text-fg underline underline-offset-4" target="_blank" rel="noreferrer">
          tests/vectors.rs
        </a>{" "}
        must stay green.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="mono text-[10px] uppercase tracking-wider text-muted">Contents</div>
          <ol className="mt-3 space-y-1.5 text-[13px]">
            {toc.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-muted transition hover:text-fg">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </aside>

        <div className="space-y-14">
          <Sec id="normalization" title="Normalization profile ascii-v1">
            <P>
              Restrictive by design so the SDK and the program validate identically. The SDK applies Unicode NFKC first; because the profile only accepts ASCII, the program re-validates bytes without a Unicode table and rejects anything non-ASCII rather than folding it.
            </P>
            <Table
              head={["Field", "Steps", "Display form", "Claim key"]}
              rows={[
                ["name", "NFKC → trim → collapse whitespace → uppercase ASCII → must match ^[A-Z0-9][A-Z0-9 ._-]{0,31}$", "SOL CAT", "SOLCAT (separators removed)"],
                ["ticker", "NFKC → trim → strip one leading $ → uppercase → must match ^[A-Z0-9]{1,10}$", "VAMP", "VAMP"],
              ]}
            />
            <P>
              Separators are stripped from the claim key on purpose: <Code>Sol Cat</Code>, <Code>sol-cat</Code>, <Code>SOL.CAT</Code> and <Code>SolCat</Code> all contend for <Code>SOLCAT</Code>. A separate <Code>confusables-v1</Code> skeleton (Cyrillic/Greek lookalikes, leetspeak digits, L→I) is computed only for review flags and never for claim keys.
            </P>
          </Sec>

          <Sec id="claims" title="Claim derivation">
            <Pre>{`claim_key_hash = sha256("vampless/claim/v1" ‖ namespace[32] ‖ field_tag[1] ‖ u32le(len) ‖ key)
namespace      = sha256("vampless/namespace/v1:" ‖ label)        // e.g. "solana-devnet"

field_tag:  0x01 name    key = utf8(name_key)
            0x02 ticker  key = utf8(ticker_key)
            0x03 raw     key = sha256(file_bytes)
            0x04 pixel   key = pixel_digest

PDA seeds:  ["claim", namespace, field_tag, claim_key_hash]`}</Pre>
            <P>One claim account per field. The existence of the account is the reservation; the Solana runtime serializes contention on it. A single hash over name+ticker+image would let an attacker change one field and reuse the others.</P>
          </Sec>

          <Sec id="images" title="Image pipeline img-v1">
            <Table
              head={["Signal", "Definition", "Role"]}
              rows={[
                ["raw", "sha256(file bytes)", "claim — blocks"],
                ["pixel", "sha256(\"vampless/pixel/img-v1\" ‖ u32 w ‖ u32 h ‖ RGB8 composited over white)", "claim — blocks"],
                ["perceptual", "pHash: 32×32 box-filter luma → DCT-II → top-left 8×8 → median(AC) threshold → 64 bits", "review when Hamming ≤ 10 — never blocks"],
              ]}
            />
            <P>Supported: static PNG, JPEG, WebP, 16–4096 px, ≤ 2 MB. GIF, SVG and animation are rejected until their comparison semantics are defined. Comparing IPFS CID strings is explicitly not a fingerprint.</P>
          </Sec>

          <Sec id="attestation" title="Attestation encoding">
            <Pre>{`"vampless/attest/v1"
u8      version = 1
[32]    namespace
lenStr  network
lenStr  policy              // "strict-any-v1" | "pair-v1"
lenStr  pipeline            // "img-v1"
[32]    applicant
[32]    intended_mint
lenStr  metadata_uri
[32]    metadata_digest
[32]    raw_image_digest
[32]    pixel_image_digest
[8]     perceptual_hash
[32]    nonce
u16     signer_key_version
u64     expiry_slot

lenStr = u32le(byte length) ‖ utf8 bytes`}</Pre>
            <P>
              Signed with Ed25519 by a trusted attester. On-chain, the program loads the <Code>Ed25519Program</Code> instruction immediately preceding <Code>register</Code> from the instructions sysvar, checks it carries exactly one signature with pubkey and message embedded in-instruction, confirms the pubkey is in <Code>config.attesters</Code>, and compares the message byte-for-byte with its own re-encoding of the registration arguments.
            </P>
          </Sec>

          <Sec id="commitment" title="Commit–reveal">
            <Pre>{`commitment = sha256("vampless/commit/v1" ‖ namespace ‖ lenStr(policy) ‖ applicant ‖ intended_mint
                    ‖ lenStr(name_key) ‖ lenStr(ticker_key) ‖ raw_digest ‖ pixel_digest ‖ metadata_digest ‖ salt[32])

pilot defaults:  min_reveal_delay = 2 slots    max_lifetime = 1500 slots (~10 min)
PDA seeds:       ["commitment", namespace, commitment]`}</Pre>
            <P>Hides the fields from mempool observers between commit and reveal. It does not reserve the unseen fields, does not prove authorship, and is required only in enforced tiers.</P>
          </Sec>

          <Sec id="program" title="Program accounts & instructions">
            <Table
              head={["Account", "Seeds", "Purpose"]}
              rows={[
                ["RegistryConfig", '["config", namespace]', "authority, attesters, reveal parameters, pause flag"],
                ["Claim", '["claim", namespace, field_tag, key_hash]', "one per protected field → identity"],
                ["Identity", '["identity", namespace, commitment_pda]', "display + keys + digests + status"],
                ["MintBinding", '["mint", namespace, mint]', "mint → identity, active | historical"],
                ["Commitment", '["commitment", namespace, commitment]', "applicant, intended mint, timing, consumed"],
                ["Dispute", '["dispute", namespace, identity, evidence_digest]', "open | upheld | rejected"],
              ]}
            />
            <Table
              head={["Instruction", "Signer", "Effect"]}
              rows={[
                ["initialize", "authority", "create config for a namespace"],
                ["commit", "applicant", "record salted commitment"],
                ["register", "controller", "verify commitment + attestation, init 4 claims + identity + binding atomically"],
                ["migrate", "controller", "bind a new mint, old binding → historical, claims unchanged"],
                ["open_dispute", "claimant", "identity → disputed"],
                ["resolve_dispute", "authority", "upheld → historical, else → registered when no open disputes"],
                ["set_review", "authority", "toggle needs_review"],
                ["update_config", "authority", "rotate attesters, pause, tune parameters"],
              ]}
            />
            <P>
              Pilot scope: <Code>strict-any-v1</Code> is enforced on-chain; <Code>pair-v1</Code> is enforced by the preflight service until conditional claim acquisition lands. The mint must be owned by SPL Token or Token-2022; on-mint metadata field verification is delegated to the launchpad adapter in this version.
            </P>
          </Sec>

          <Sec id="api" title="API surface">
            <Table
              head={["Endpoint", "Blueprint name", "Returns"]}
              rows={[
                ["POST /v1/check", "checkIdentity", "normalized fields, decision (blocking / review / informational), freshness"],
                ["POST /v1/inspect", "—", "fingerprints for an uploaded image, optional preflight"],
                ["POST /v1/attest", "attestContent", "signed inspected-content statement bound to applicant and mint"],
                ["POST /v1/register", "registerAndLaunch (pilot ledger)", "identity, claims, decision — 409 on conflict"],
                ["GET /v1/resolve/:mint", "resolveMint", "label, identity, observed record, conflicts, freshness"],
                ["GET /v1/identities[/:id]", "—", "search, detail with claims and disputes"],
                ["GET /v1/observed · POST /v1/observe", "—", "observed-token index and admin ingest"],
                ["POST /v1/disputes · /:id/resolve", "submitDispute", "traceable case, transparent resolution"],
              ]}
            />
          </Sec>

          <Sec id="errors" title="Error codes">
            <div className="flex flex-wrap gap-1.5">
              {[
                "INVALID_NAME",
                "INVALID_TICKER",
                "INVALID_IMAGE",
                "CONFLICT",
                "ATTESTATION_INVALID",
                "COMMITMENT_INVALID",
                "MINT_ALREADY_BOUND",
                "POLICY_NOT_ENFORCED",
                "NameClaimed",
                "TickerClaimed",
                "RawImageClaimed",
                "PixelImageClaimed",
                "NotCanonical",
                "RevealTooEarly",
                "CommitmentExpired",
                "CommitmentMismatch",
                "AttestationMissing",
                "AttestationMalformed",
                "AttesterNotTrusted",
                "AttestationMismatch",
                "AttestationExpired",
                "MintNotToken",
                "Paused",
              ].map((e) => (
                <Badge key={e} tone={/^[A-Z_]+$/.test(e) ? "violet" : "accent"}>
                  {e}
                </Badge>
              ))}
            </div>
            <P>
              Upper-snake codes are returned by the SDK and API; CamelCase codes are Anchor errors from the program. Every rejection carries the matched fields so an integrator can show the creator exactly why.
            </P>
          </Sec>

          <Sec id="status" title="Status labels">
            <Table
              head={["Label", "Meaning"]}
              rows={[
                ["registered", "A particular mint is bound to a registry identity under a stated policy."],
                ["needs_review", "Registered with a pending review signal: observed collision, similar image or lookalike."],
                ["disputed", "A claim is under a documented challenge."],
                ["historical", "Record retained after an authorized migration or upheld dispute. Claims are not released."],
                ["observed_conflict", "Created outside the registry and shares a protected field with a registered identity. Intent not established."],
                ["observed", "Seen by the indexer; no registry conflict."],
                ["unknown", "Not in the registry and not observed. Not a safety verdict in either direction."],
              ]}
            />
          </Sec>
        </div>
      </div>
    </main>
  );
}

function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-7 text-muted">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="mono rounded bg-white/[0.06] px-1.5 py-0.5 text-[12.5px] text-fg/90">{children}</code>;
}

function Pre({ children }: { children: string }) {
  return <pre className="mono overflow-x-auto rounded-xl border border-line bg-black/40 p-4 text-[12px] leading-6 text-fg/85">{children}</pre>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-[13px]">
        <thead className="mono bg-white/[0.03] text-[10px] uppercase tracking-wider text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-3 ${j === 0 ? "mono text-fg/90" : "text-muted"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
