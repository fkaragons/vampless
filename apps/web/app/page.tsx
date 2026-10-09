import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Fingerprint, GitBranch, Layers, Lock, Radar, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";
import { HeroVisual } from "@/components/hero-visual";
import { Badge, Card, Eyebrow, H2, Lead, Reveal, Section } from "@/components/ui";
import { GITHUB_URL } from "@/lib/site";

export default function Home() {
  return (
    <main>
      <Hero />
      <ProofStrip />
      <Problem />
      <Flow />
      <Signals />
      <Policies />
      <Adoption />
      <Boundary />
      <Architecture />
      <CTA />
    </main>
  );
}

function Hero() {
  return (
    <div className="relative overflow-hidden">
      <div className="grid-bg absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute left-1/2 top-[-20%] -z-10 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(229,36,59,0.22),transparent)] blur-3xl" />
      <Section className="pt-16 md:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <Reveal>
              <Eyebrow>Shared token identity registry · Solana pilot</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl">
                One name. <br className="hidden md:block" />
                One ticker. <br className="hidden md:block" />
                <span className="text-gradient">One registry.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-muted">
                Vampless lets launchpads reserve a token&apos;s name, ticker and image before launch — atomically, in one transaction. A reservation made on one launchpad is honored on every other, so the same identity cannot be minted twice across the network.
              </p>
            </Reveal>
            <Reveal delay={0.15} className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/demo" className="glow-accent inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white transition hover:brightness-110">
                Run the live demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/spec" className="inline-flex items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-medium transition hover:bg-white/5">
                Read the spec
              </Link>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="mono px-2 text-[12px] text-muted underline-offset-4 hover:text-fg hover:underline">
                MIT · open source
              </a>
            </Reveal>
          </div>
          <Reveal delay={0.2}>
            <Suspense fallback={<div className="mx-auto h-[380px] w-full max-w-xl rounded-3xl border border-line bg-white/[0.02]" />}>
              <HeroVisual />
            </Suspense>
          </Reveal>
        </div>
      </Section>
    </div>
  );
}

function ProofStrip() {
  const items = [
    ["4", "independent claims", "name · ticker · raw image · pixel image"],
    ["1", "transaction", "claims, mint binding and launch succeed or fail together"],
    ["3", "image signals", "exact file, exact pixels, perceptual similarity"],
    ["3", "policy tiers", "observe · pair · strict — never mixed under one badge"],
  ];
  return (
    <div className="hairline mx-auto max-w-7xl px-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
        {items.map(([n, label, sub], i) => (
          <Reveal key={label} delay={i * 0.05} className="bg-bg p-6">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold tracking-tight text-fg">{n}</span>
              <span className="text-sm text-fg/80">{label}</span>
            </div>
            <div className="mono mt-2 text-[11px] uppercase tracking-wider text-muted">{sub}</div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function Problem() {
  const cards = [
    {
      icon: Layers,
      title: "Every launchpad is an island",
      body: "Solana identifies a token by its mint address. Name, ticker and image are free-form metadata. Nothing stops a second launchpad — or a direct program call — from minting the same identity a minute later.",
    },
    {
      icon: ScanSearch,
      title: "Visual impersonation is cheap",
      body: "Re-save the logo as a different file, swap a Latin letter for a Cyrillic lookalike, add a hyphen. Hash-the-URL checks miss all of it. Only content fingerprints and normalized keys catch it.",
    },
    {
      icon: Lock,
      title: "Metadata can change after inspection",
      body: "A token can pass every check and then rename itself. If the metadata update path is not part of the integration, the registry is checking a snapshot that no longer exists.",
    },
  ];
  return (
    <Section id="problem">
      <Reveal>
        <Eyebrow>The problem</Eyebrow>
        <H2>Token identity has no owner, so anyone can wear it.</H2>
        <Lead>The blockchain guarantees that a mint address is unique. It makes no promise about the name on top of it. Vampless adds that promise — for every launchpad that shares the registry.</Lead>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {cards.map((c, i) => (
          <Reveal key={c.title} delay={i * 0.07}>
            <Card className="h-full">
              <c.icon className="h-5 w-5 text-[#ff8a9a]" />
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{c.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{c.body}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function Flow() {
  const steps = [
    { n: "01", title: "Prepare", body: "Creator signs with the controller wallet, picks the intended mint, uploads immutable metadata and image.", code: "metadataUri = ipfs://bafy…/metadata.json" },
    { n: "02", title: "Inspect", body: "Service validates the format, computes raw, pixel and perceptual fingerprints, checks registered claims and the observed-token index. Reserves nothing.", code: "POST /v1/inspect → { fingerprint, check }" },
    { n: "03", title: "Commit", body: "Salted commitment binds every field, the policy, the intended mint and the controller. Minimum reveal delay and maximum lifetime are enforced.", code: "commit(sha256(domain ‖ ns ‖ policy ‖ … ‖ salt))" },
    { n: "04", title: "Attest", body: "The image verifier signs a statement about what it inspected, bound to applicant and mint, with nonce, key version and expiry.", code: "Ed25519(attester, encodeAttestation(stmt))" },
    { n: "05", title: "Register & launch", body: "The program verifies commitment and attestation, acquires all four claim PDAs, binds the identity to the mint. Any conflict fails the whole transaction.", code: "register(args) → 4× Claim + Identity + MintBinding" },
    { n: "06", title: "Confirm", body: "The indexer publishes the identity with observed slot and freshness. Explorers and wallets resolve the mint to a registry status.", code: "GET /v1/resolve/:mint → registered | observed_conflict | …" },
  ];
  return (
    <Section id="flow" className="relative">
      <div className="pointer-events-none absolute right-0 top-20 -z-10 h-[500px] w-[500px] rounded-full bg-[radial-gradient(closest-side,rgba(124,92,255,0.16),transparent)] blur-3xl" />
      <Reveal>
        <Eyebrow>How it works</Eyebrow>
        <H2>Six steps. One atomic outcome.</H2>
        <Lead>Preflight is advisory. Only the final transaction reserves anything — and it reserves everything or nothing.</Lead>
      </Reveal>
      <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.05}>
            <li className="glass group relative h-full rounded-2xl p-6 transition hover:border-line-strong">
              <div className="flex items-center justify-between">
                <span className="mono text-[12px] text-[#ff8a9a]">{s.n}</span>
                {s.n === "05" && <Badge tone="accent">on-chain</Badge>}
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{s.body}</p>
              <code className="mono mt-5 block truncate rounded-lg border border-line bg-black/30 px-3 py-2 text-[11px] text-fg/80">{s.code}</code>
            </li>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

function Signals() {
  const sig = [
    { icon: Fingerprint, name: "raw", title: "Exact file", catches: "Identical uploads, regardless of filename, URL or IPFS import settings.", misses: "Any re-encode.", how: "sha256(fileBytes)", tone: "accent" as const },
    { icon: Layers, name: "pixel", title: "Exact pixels", catches: "The same image re-packaged: PNG→WebP, stripped metadata, different compression.", misses: "Resizes and lossy recompression.", how: "sha256(w ‖ h ‖ RGB over white)", tone: "violet" as const },
    { icon: Radar, name: "perceptual", title: "Looks the same", catches: "Resizes, JPEG recompression, small edits, overlays — as a review flag.", misses: "Nothing silently: distance ≤ 10 is review, never an automatic verdict.", how: "pHash · 32×32 DCT · 64 bits", tone: "warn" as const },
  ];
  return (
    <Section id="signals">
      <Reveal>
        <Eyebrow>Image identity</Eyebrow>
        <H2>Three signals, three different jobs.</H2>
        <Lead>Two of them are claims and can block a launch. The third is evidence for a human and can only ask for review. Similarity is never treated as equality.</Lead>
      </Reveal>
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {sig.map((s, i) => (
          <Reveal key={s.name} delay={i * 0.07}>
            <Card className="h-full">
              <div className="flex items-center justify-between">
                <s.icon className="h-5 w-5 text-fg/80" />
                <Badge tone={s.tone}>{s.name}</Badge>
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{s.title}</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="mono text-[11px] uppercase tracking-wider text-ok">Catches</dt>
                  <dd className="mt-1 leading-6 text-muted">{s.catches}</dd>
                </div>
                <div>
                  <dt className="mono text-[11px] uppercase tracking-wider text-[#ff8a9a]">Does not</dt>
                  <dd className="mt-1 leading-6 text-muted">{s.misses}</dd>
                </div>
              </dl>
              <code className="mono mt-5 block rounded-lg border border-line bg-black/30 px-3 py-2 text-[11px] text-fg/80">{s.how}</code>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function Policies() {
  const rows: Array<{ id: string; label: string; enforced: boolean; rule: string; who: string; tone: "neutral" | "violet" | "accent" }> = [
    { id: "observe", label: "Observe", enforced: false, rule: "Never rejects. Returns every exact and likely conflict with evidence and freshness.", who: "Wallets, explorers, bots, any launchpad front-end — one fetch call.", tone: "neutral" },
    { id: "pair-v1", label: "Pair", enforced: true, rule: "Rejects when name and ticker both match, or when an image matches. Name-only or ticker-only overlaps are reported.", who: "Launchpads that want protection without blocking common words.", tone: "violet" },
    { id: "strict-any-v1", label: "Strict", enforced: true, rule: "Rejects on an unauthorized match of any protected field. The full guarantee.", who: "Launchpads that market “no impersonation, period”.", tone: "accent" },
  ];
  return (
    <Section id="policies">
      <Reveal>
        <Eyebrow>Policy tiers</Eyebrow>
        <H2>Enforcement is a dial, not a switch.</H2>
        <Lead>Every decision, badge and record names the policy that produced it. A Pair badge never pretends to be Strict, and Observe never pretends to protect.</Lead>
      </Reveal>
      <div className="mt-12 overflow-hidden rounded-2xl border border-line">
        {rows.map((r, i) => (
          <Reveal key={r.id} delay={i * 0.05}>
            <div className={`grid gap-4 p-6 md:grid-cols-[180px_1fr_1fr] ${i > 0 ? "border-t border-line" : ""} bg-white/[0.015]`}>
              <div>
                <div className="text-lg font-semibold tracking-tight">{r.label}</div>
                <div className="mono mt-1 text-[11px] text-muted">{r.id}</div>
                <Badge tone={r.enforced ? r.tone : "neutral"} className="mt-3">
                  {r.enforced ? "enforced" : "advisory"}
                </Badge>
              </div>
              <p className="text-sm leading-6 text-fg/85">{r.rule}</p>
              <p className="text-sm leading-6 text-muted">{r.who}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function Adoption() {
  const phases = [
    { n: "0", title: "Observed index", body: "Watch token creation on Solana. Fingerprint every name, ticker and image. Fill the database before anyone asks.", needs: "no launchpad" },
    { n: "1", title: "Check API + badge", body: "Free checkIdentity and resolveMint. “This ticker exists on 14 mints — here is the first.” Wallets, bots and launchpad UIs integrate with one call.", needs: "no launchpad" },
    { n: "2", title: "Registered tier", body: "Creators register through the Vampless program directly. A verifiable on-chain badge even where the launchpad is not integrated.", needs: "no launchpad" },
    { n: "3", title: "Enforced tier", body: "A launchpad routes launches through the registry CPI. Conflicting launches fail. By now the registry is populated and the API is already in its front-end.", needs: "one launchpad" },
    { n: "4", title: "Shared enforcement", body: "A second launchpad joins. A reservation made on one is honored by the other — the protocol's central value.", needs: "two launchpads" },
  ];
  return (
    <Section id="adoption" className="relative">
      <div className="pointer-events-none absolute left-0 top-10 -z-10 h-[500px] w-[500px] rounded-full bg-[radial-gradient(closest-side,rgba(229,36,59,0.12),transparent)] blur-3xl" />
      <Reveal>
        <Eyebrow>Why this gets used</Eyebrow>
        <H2>Useful on day one, with zero launchpad cooperation.</H2>
        <Lead>The original design only paid off after launchpads agreed to a mandatory integration. We invert the order: ship the read side first, let demand pull enforcement in.</Lead>
      </Reveal>
      <div className="mt-12 grid gap-3">
        {phases.map((p, i) => (
          <Reveal key={p.n} delay={i * 0.05}>
            <div className="glass grid items-start gap-4 rounded-2xl p-5 md:grid-cols-[72px_220px_1fr_160px] md:items-center">
              <div className="text-3xl font-semibold tracking-tight text-fg/90">{p.n}</div>
              <div className="font-medium">{p.title}</div>
              <p className="text-sm leading-6 text-muted">{p.body}</p>
              <Badge tone={p.needs === "no launchpad" ? "ok" : "violet"} className="md:justify-self-end">
                {p.needs}
              </Badge>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function Boundary() {
  const items = [
    "Tokens created outside participating programs still exist. Vampless shows them as observed conflicts; it cannot un-mint them.",
    "First registration is not proof of authorship. The registry records order; disputes with evidence settle intent.",
    "A registry badge is not a safety rating. It says who holds the identity, not whether you should buy.",
    "Similarity is not equality. Perceptual matches request review and never automatically reject.",
  ];
  return (
    <Section id="boundary">
      <div className="glass rounded-3xl p-8 md:p-12">
        <Reveal>
          <Eyebrow>Boundaries</Eyebrow>
          <H2>What Vampless does not claim.</H2>
          <Lead>Protocols that overstate their guarantees get bypassed quietly. We state the boundary and then show it in the demo.</Lead>
        </Reveal>
        <ul className="mt-10 grid gap-4 md:grid-cols-2">
          {items.map((t, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <li className="flex gap-3 rounded-xl border border-line bg-black/20 p-4 text-sm leading-6 text-fg/85">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#ff8a9a]" />
                {t}
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Architecture() {
  const parts = [
    { icon: Lock, name: "Registry program", path: "programs/vampless-registry", body: "Anchor · claim PDAs, commit–reveal, Ed25519 attestation introspection, mint binding, disputes." },
    { icon: Sparkles, name: "@vampless/core", path: "packages/core", body: "Normalization ascii-v1, policies, fingerprints, claim keys, attestation encoding, atomic registry. Runs in Node and browsers." },
    { icon: Radar, name: "Registry API", path: "services/api", body: "checkIdentity, inspect, attest, register, resolveMint, disputes, observed-token ingest. SQLite-backed." },
    { icon: GitBranch, name: "Cross-impl vectors", path: "programs/…/tests/vectors.rs", body: "The Rust program and the TypeScript core must produce identical namespace, claim, attestation and commitment bytes." },
  ];
  return (
    <Section id="architecture">
      <Reveal>
        <Eyebrow>Architecture</Eyebrow>
        <H2>One encoding, three runtimes.</H2>
        <Lead>Everything that hashes is specified once and tested across implementations. If the SDK and the program ever disagree on a byte, the build fails.</Lead>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {parts.map((p, i) => (
          <Reveal key={p.name} delay={i * 0.05}>
            <Card className="h-full">
              <div className="flex items-center gap-3">
                <p.icon className="h-5 w-5 text-fg/80" />
                <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
              </div>
              <code className="mono mt-3 block text-[11px] text-[#ff8a9a]">{p.path}</code>
              <p className="mt-3 text-sm leading-6 text-muted">{p.body}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function CTA() {
  return (
    <Section>
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-line p-10 text-center md:p-16">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(229,36,59,0.25),transparent_60%)]" />
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">Watch a duplicate get rejected.</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted">The demo runs the real registry in your browser: two launchpads, one namespace, every acceptance test from the blueprint.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/demo" className="glow-accent inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white transition hover:brightness-110">
              Open the demo <ArrowRight className="h-4 w-4" />
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-medium transition hover:bg-white/5">
              Star on GitHub
            </a>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
