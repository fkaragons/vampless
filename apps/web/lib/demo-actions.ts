"use client";

import {
  b58,
  fingerprintImage,
  fingerprintToJson,
  fromHex,
  randomBytes,
  signAttestation,
  type AttestationStatement,
  type ImageDigests,
  type PolicyId,
  type RegisterResult,
} from "@vampless/core";
import { appendLog, getAttesterSecret, getRegistry, nextSlot, randomAddress, touch } from "./registry-store";
import { syntheticLogo } from "./decode-image";

export interface LaunchInput {
  name: string;
  ticker: string;
  image?: ImageDigests;
  metadataUri?: string;
  controller: string;
  mint: string;
  policy: PolicyId;
  launchpad: string;
}

/** Full pilot launch: attest (signed by the trusted attester) → register. */
export function launch(input: LaunchInput): RegisterResult {
  const registry = getRegistry();
  const slot = nextSlot();
  let attestation;
  if (input.image) {
    const statement: AttestationStatement = {
      version: 1,
      namespace: registry.namespace,
      network: registry.network,
      policy: input.policy,
      pipeline: "img-v1",
      applicant: b58.decode(input.controller),
      intendedMint: b58.decode(input.mint),
      metadataUri: input.metadataUri ?? "",
      metadataDigest: new Uint8Array(32),
      rawImageDigest: fromHex(input.image.raw),
      pixelImageDigest: fromHex(input.image.pixel),
      perceptualHash: fromHex(input.image.perceptual),
      nonce: randomBytes(32),
      signerKeyVersion: 1,
      expirySlot: BigInt(slot + 300),
    };
    attestation = signAttestation(statement, getAttesterSecret());
  }
  const result = registry.register(
    { name: input.name, ticker: input.ticker, ...(input.image ? { image: input.image } : {}), ...(input.metadataUri ? { metadataUri: input.metadataUri } : {}) },
    { policy: input.policy, controller: input.controller, mint: input.mint, slot, launchpad: input.launchpad, ...(attestation ? { attestation } : {}) },
  );
  if (result.ok) {
    appendLog({
      slot,
      launchpad: input.launchpad,
      kind: result.identity.status === "needs_review" ? "review" : "register",
      title: `${result.identity.status === "needs_review" ? "Registered — needs review" : "Registered"} ${result.identity.display.name} / $${result.identity.display.ticker}`,
      detail: result.identity.status === "needs_review" ? result.decision.reasons.join(" ") : `${result.claims.length} claims acquired · mint ${short(input.mint)}`,
    });
  } else {
    appendLog({
      slot,
      launchpad: input.launchpad,
      kind: "reject",
      title: `Rejected ${input.name} / ${input.ticker} — ${result.code}`,
      detail: result.reason,
    });
  }
  return result;
}

/** Simulate a token minted outside every integrated launchpad. */
export function bypass(input: { name: string; ticker: string; image?: ImageDigests; source?: string }): string {
  const registry = getRegistry();
  const mint = randomAddress();
  const slot = nextSlot();
  registry.observe({
    mint,
    name: input.name,
    ticker: input.ticker,
    slot,
    source: input.source ?? "direct-program-call",
    ...(input.image ? { rawImage: input.image.raw, pixelImage: input.image.pixel, perceptual: input.image.perceptual } : {}),
  });
  const res = registry.resolveMint(mint);
  appendLog({
    slot,
    launchpad: "external",
    kind: "observe",
    title: `Observed ${input.name} / ${input.ticker} minted outside the registry`,
    detail: res.label === "observed_conflict" ? `Indexer flags it as observed_conflict (${res.conflicts.length} conflicting field(s)). Vampless cannot prevent it — it can only show it.` : "No conflict with registered identities.",
  });
  touch();
  return mint;
}

export function fingerprintSynthetic(seed: number, tweak = 0): { image: ImageDigests; dataUrl: string } {
  const { decoded, bytes, dataUrl } = syntheticLogo(seed, 96, tweak);
  const j = fingerprintToJson(fingerprintImage(bytes, decoded));
  return { image: { raw: j.raw, pixel: j.pixel, perceptual: j.perceptual }, dataUrl };
}

/** Same pixels, different file bytes (re-packaged PNG). */
export function repackagedSynthetic(seed: number): { image: ImageDigests; dataUrl: string } {
  const { decoded, bytes, dataUrl } = syntheticLogo(seed, 96, 0);
  // Append a benign trailing chunk-like tail: the file digest changes, the pixel digest does not.
  const tail = new TextEncoder().encode("vampless-repack");
  const repacked = new Uint8Array(bytes.length + tail.length);
  repacked.set(bytes);
  repacked.set(tail, bytes.length);
  const j = fingerprintToJson(fingerprintImage(repacked, decoded));
  return { image: { raw: j.raw, pixel: j.pixel, perceptual: j.perceptual }, dataUrl };
}

export function short(s: string | null | undefined, n = 4): string {
  if (!s) return "—";
  return s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

export type ScenarioStep = { title: string; run: () => string | void };

/** The blueprint's §11 "first demonstration", scripted. */
export function buildScenario(policy: PolicyId, wallets: { a: string; b: string }): ScenarioStep[] {
  const logo = fingerprintSynthetic(1);
  const altered = fingerprintSynthetic(1, 3);
  const repack = repackagedSynthetic(1);
  const fresh = fingerprintSynthetic(5);
  const P = policy === "observe" ? "strict-any-v1" : policy;
  return [
    { title: "Launchpad A registers Vampless / $VAMP with its logo", run: () => outcome(launch({ name: "Vampless", ticker: "VAMP", image: logo.image, controller: wallets.a, mint: randomAddress(), policy: P, launchpad: "launchpad-a", metadataUri: "ipfs://bafy…/vampless.json" })) },
    { title: "Launchpad B tries the same name with a hyphen and a new ticker", run: () => outcome(launch({ name: "vamp-less", ticker: "OTHER", image: fresh.image, controller: wallets.b, mint: randomAddress(), policy: P, launchpad: "launchpad-b" })) },
    { title: "Launchpad B tries a new name with the same ticker", run: () => outcome(launch({ name: "Totally Different", ticker: "$vamp", controller: wallets.b, mint: randomAddress(), policy: P, launchpad: "launchpad-b" })) },
    { title: "Launchpad B tries new name & ticker with the identical logo, re-packaged", run: () => outcome(launch({ name: "New Name", ticker: "NEWT", image: repack.image, controller: wallets.b, mint: randomAddress(), policy: P, launchpad: "launchpad-b" })) },
    { title: "Launchpad B tries a subtly altered logo", run: () => outcome(launch({ name: "Another Name", ticker: "ANTH", image: altered.image, controller: wallets.b, mint: randomAddress(), policy: P, launchpad: "launchpad-b" })) },
    { title: "Launchpad B tries a leetspeak lookalike name", run: () => outcome(launch({ name: "V4MPL3SS", ticker: "VMPL", controller: wallets.b, mint: randomAddress(), policy: P, launchpad: "launchpad-b" })) },
    { title: "Someone mints VAMPLESS / VAMP directly, bypassing every launchpad", run: () => `observed_conflict · mint ${short(bypass({ name: "VAMPLESS", ticker: "VAMP", image: logo.image, source: "pump.fun" }))}` },
    { title: "Launchpad B registers an unrelated token", run: () => outcome(launch({ name: "Moon Cat", ticker: "MCAT", image: fingerprintSynthetic(9).image, controller: wallets.b, mint: randomAddress(), policy: P, launchpad: "launchpad-b" })) },
  ];
}

function outcome(r: RegisterResult): string {
  if (r.ok) return r.identity.status === "needs_review" ? `needs_review · ${r.decision.review.map((m) => m.field).join(", ")}` : `registered · ${r.claims.length} claims`;
  if (r.code === "CONFLICT") return `rejected · ${r.decision.blocking.map((m) => m.field).join(", ")}`;
  return `rejected · ${r.code}`;
}
