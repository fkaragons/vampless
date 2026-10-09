/**
 * These tests are the blueprint's "first demonstration" (§11): launch one test
 * identity, then reject duplicates from a second wallet — name-only,
 * ticker-only, identical-file, equivalent-pixel — reject reused or wrongly
 * bound attestations, show that an altered image yields a similarity review
 * rather than a false guarantee, and show an external bypass as an observed
 * conflict.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { MemoryStore } from "./store.ts";
import { Registry } from "./registry.ts";
import { b58 } from "./hash.ts";
import { fingerprintToJson, hammingDistance } from "./image.ts";
import { fingerprintFile, encodePng } from "./node/index.ts";
import { fromHex, toHex } from "./encoding.ts";
import { publicKeyFromSecret, randomBytes, randomSecretKey, signAttestation, type AttestationStatement } from "./attestation.ts";
import { computeCommitment, verifyCommitmentReveal } from "./commitment.ts";
import { makeLogo } from "./image.test.ts";
import type { ImageDigests } from "./types.ts";

const wallet = () => b58.encode(randomBytes(32));
const mintAddr = () => b58.encode(randomBytes(32));

function digestsOf(bytes: Uint8Array): ImageDigests {
  const r = fingerprintFile(bytes);
  if (!r.ok) throw new Error(r.reason);
  const j = fingerprintToJson(r.fingerprint);
  return { raw: j.raw, pixel: j.pixel, perceptual: j.perceptual };
}

describe("Registry — strict-any-v1 acceptance demonstration", () => {
  let reg: Registry;
  const alice = wallet();
  const mallory = wallet();
  const logoPng = encodePng(makeLogo(1));
  const logo = digestsOf(logoPng);

  beforeEach(() => {
    reg = new Registry(new MemoryStore(), { namespaceLabel: "solana-devnet", network: "solana-devnet" });
    const r = reg.register({ name: "Vampless", ticker: "VAMP", image: logo }, { policy: "strict-any-v1", controller: alice, mint: mintAddr(), slot: 100, launchpad: "launchpad-a" });
    assert.ok(r.ok, JSON.stringify(r));
  });

  it("registers one identity and acquires four distinct claims", () => {
    const [id] = reg.listIdentities();
    assert.ok(id);
    assert.equal(id.status, "registered");
    const claims = reg.claimsOf(id.id);
    assert.deepEqual(claims.map((c) => c.field).sort(), ["name", "pixelImage", "rawImage", "ticker"]);
    assert.equal(new Set(claims.map((c) => c.key)).size, 4);
  });

  it("rejects name-only duplicate from a second wallet (through a second launchpad)", () => {
    const r = reg.register({ name: "vamp-less", ticker: "OTHER" }, { policy: "strict-any-v1", controller: mallory, mint: mintAddr(), slot: 101, launchpad: "launchpad-b" });
    assert.equal(r.ok, false);
    if (!r.ok && r.code === "CONFLICT") {
      assert.deepEqual(r.decision.blocking.map((m) => m.field), ["name"]);
    } else assert.fail("expected CONFLICT");
  });

  it("rejects ticker-only duplicate", () => {
    const r = reg.register({ name: "Totally Different", ticker: "$vamp" }, { policy: "strict-any-v1", controller: mallory, mint: mintAddr(), slot: 101 });
    assert.equal(r.ok, false);
    if (!r.ok && r.code === "CONFLICT") assert.deepEqual(r.decision.blocking.map((m) => m.field), ["ticker"]);
  });

  it("rejects identical image file with new name and ticker", () => {
    const r = reg.register({ name: "New Name", ticker: "NEWT", image: logo }, { policy: "strict-any-v1", controller: mallory, mint: mintAddr(), slot: 101 });
    assert.equal(r.ok, false);
    if (!r.ok && r.code === "CONFLICT") assert.deepEqual(r.decision.blocking.map((m) => m.field).sort(), ["pixelImage", "rawImage"]);
  });

  it("rejects equivalent pixels in a differently packaged file", () => {
    const img = makeLogo(1);
    const png = new PNG({ width: img.width, height: img.height });
    png.data = Buffer.from(img.data);
    const repackaged = digestsOf(new Uint8Array(PNG.sync.write(png, { deflateLevel: 0, filterType: 0 })));
    assert.notEqual(repackaged.raw, logo.raw);
    assert.equal(repackaged.pixel, logo.pixel);
    const r = reg.register({ name: "New Name", ticker: "NEWT", image: repackaged }, { policy: "strict-any-v1", controller: mallory, mint: mintAddr(), slot: 101 });
    assert.equal(r.ok, false);
    if (!r.ok && r.code === "CONFLICT") assert.deepEqual(r.decision.blocking.map((m) => m.field), ["pixelImage"]);
  });

  it("flags an altered image for review instead of guaranteeing uniqueness", () => {
    const altered = makeLogo(1);
    const d = new Uint8Array(altered.data);
    for (let i = 0; i < d.length; i += 4) d[i] = Math.min(255, (d[i] as number) + 4);
    const alteredDigests = digestsOf(encodePng({ ...altered, data: d }));
    assert.notEqual(alteredDigests.pixel, logo.pixel);
    assert.ok(hammingDistance(fromHex(alteredDigests.perceptual), fromHex(logo.perceptual)) <= 10);

    const r = reg.register({ name: "New Name", ticker: "NEWT", image: alteredDigests }, { policy: "strict-any-v1", controller: mallory, mint: mintAddr(), slot: 101 });
    assert.ok(r.ok);
    assert.equal(r.identity.status, "needs_review");
    assert.ok(r.decision.review.some((m) => m.field === "perceptual"));
  });

  it("flags a Cyrillic lookalike as a confusable (and rejects it from ascii-v1)", () => {
    // Unsupported chars are rejected outright by the profile...
    const r = reg.check({ name: "VАMPLESS", ticker: "NEWT" }, "strict-any-v1");
    assert.equal(r.ok, false);
    // ...but leetspeak within the ASCII profile is flagged for review.
    const r2 = reg.check({ name: "V4MPL3SS", ticker: "NEWT" }, "strict-any-v1");
    assert.ok(r2.ok);
    assert.equal(r2.decision.status, "needs_review");
    assert.ok(r2.decision.review.some((m) => m.field === "confusable-name"));
  });

  it("a failed registration leaves no partial claims (atomicity)", () => {
    const before = reg.listIdentities().length;
    const r = reg.register({ name: "Fresh Name", ticker: "VAMP" }, { policy: "strict-any-v1", controller: mallory, mint: mintAddr(), slot: 101 });
    assert.equal(r.ok, false);
    assert.equal(reg.listIdentities().length, before);
    const fresh = reg.check({ name: "Fresh Name", ticker: "FRESH" }, "strict-any-v1");
    assert.ok(fresh.ok && fresh.decision.status === "available", "name must not have been reserved by the failed attempt");
  });

  it("shows an external deployment that bypassed the registry as an observed conflict", () => {
    const bypassMint = mintAddr();
    reg.observe({ mint: bypassMint, name: "VAMPLESS", ticker: "VAMP", slot: 150, source: "pump.fun", rawImage: logo.raw, pixelImage: logo.pixel, perceptual: logo.perceptual });
    const res = reg.resolveMint(bypassMint);
    assert.equal(res.label, "observed_conflict");
    assert.ok(res.conflicts.some((m) => m.kind === "registered" && m.field === "ticker"));
  });

  it("routes a registration that collides with a pre-existing observed token to review", () => {
    const fresh = new Registry(new MemoryStore(), { namespaceLabel: "solana-devnet", network: "solana-devnet" });
    fresh.observe({ mint: mintAddr(), name: "Old Project", ticker: "OLD", slot: 10, source: "pump.fun" });
    const r = fresh.register({ name: "Old Project", ticker: "OLD" }, { policy: "strict-any-v1", controller: mallory, mint: mintAddr(), slot: 200 });
    assert.ok(r.ok);
    assert.equal(r.identity.status, "needs_review");
  });

  it("rejects binding a second identity to an already-bound mint", () => {
    const [id] = reg.listIdentities();
    const r = reg.register({ name: "Other", ticker: "OTH" }, { policy: "strict-any-v1", controller: mallory, mint: id!.mint, slot: 101 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "MINT_ALREADY_BOUND");
  });

  it("migration keeps the old binding as historical and claims intact", () => {
    const [id] = reg.listIdentities();
    const oldMint = id!.mint!;
    const newMint = mintAddr();
    reg.migrate(id!.id, newMint, alice, 300);
    assert.equal(reg.resolveMint(newMint).label, "registered");
    assert.equal(reg.resolveMint(oldMint).label, "historical");
    const r = reg.register({ name: "Vampless", ticker: "ZZZ" }, { policy: "strict-any-v1", controller: mallory, mint: mintAddr(), slot: 301 });
    assert.equal(r.ok, false, "name claim must survive migration");
  });

  it("disputes change status and resolve transparently", () => {
    const [id] = reg.listIdentities();
    const d = reg.openDispute(id!.id, mallory, toHex(randomBytes(32)), 400);
    assert.equal(reg.getIdentity(id!.id)!.status, "disputed");
    reg.resolveDispute(d.id, false, wallet(), "insufficient evidence", 410);
    assert.equal(reg.getIdentity(id!.id)!.status, "registered");
    assert.equal(reg.getIdentity(id!.id)!.history.at(-1)!.event, "dispute_resolved");
  });
});

describe("Registry — policies", () => {
  it("pair-v1 reports a name-only overlap but blocks name+ticker and image", () => {
    const reg = new Registry(new MemoryStore(), { namespaceLabel: "solana-devnet", network: "solana-devnet" });
    const logo = digestsOf(encodePng(makeLogo(5)));
    assert.ok(reg.register({ name: "Moon", ticker: "MOON", image: logo }, { policy: "pair-v1", controller: wallet(), mint: mintAddr(), slot: 1 }).ok);

    const nameOnly = reg.check({ name: "Moon", ticker: "LUNA" }, "pair-v1");
    assert.ok(nameOnly.ok);
    assert.equal(nameOnly.decision.status, "available");
    assert.equal(nameOnly.decision.informational.length, 1);

    const pair = reg.check({ name: "moon", ticker: "$moon" }, "pair-v1");
    assert.ok(pair.ok);
    assert.equal(pair.decision.status, "conflict");

    const image = reg.check({ name: "Sun", ticker: "SUN", image: logo }, "pair-v1");
    assert.ok(image.ok);
    assert.equal(image.decision.status, "conflict");
  });

  it("observe never enforces and cannot register", () => {
    const reg = new Registry(new MemoryStore(), { namespaceLabel: "solana-devnet", network: "solana-devnet" });
    assert.ok(reg.register({ name: "A", ticker: "A" }, { policy: "strict-any-v1", controller: wallet(), mint: mintAddr(), slot: 1 }).ok);
    const c = reg.check({ name: "A", ticker: "A" }, "observe");
    assert.ok(c.ok);
    assert.equal(c.decision.status, "available");
    assert.equal(c.decision.enforced, false);
    assert.equal(c.decision.informational.length, 2);
    const r = reg.register({ name: "B", ticker: "B" }, { policy: "observe", controller: wallet(), mint: mintAddr(), slot: 2 });
    assert.equal(r.ok, false);
  });

  it("devnet records never reserve mainnet names (separate namespaces)", () => {
    const dev = new Registry(new MemoryStore(), { namespaceLabel: "solana-devnet", network: "solana-devnet" });
    const main = new Registry(new MemoryStore(), { namespaceLabel: "solana-mainnet", network: "solana-mainnet" });
    assert.notEqual(dev.namespaceHex, main.namespaceHex);
    assert.notEqual(dev.claimKeyFor("name", "VAMPLESS"), main.claimKeyFor("name", "VAMPLESS"));
  });
});

describe("Attestations", () => {
  const attesterSecret = randomSecretKey();
  const attesterPub = publicKeyFromSecret(attesterSecret);
  const logoPng = encodePng(makeLogo(7));
  const logo = digestsOf(logoPng);

  function stmt(reg: Registry, applicant: string, mint: string, over: Partial<AttestationStatement> = {}): AttestationStatement {
    return {
      version: 1,
      namespace: reg.namespace,
      network: reg.network,
      policy: "strict-any-v1",
      pipeline: "img-v1",
      applicant: b58.decode(applicant),
      intendedMint: b58.decode(mint),
      metadataUri: "ipfs://bafy.../metadata.json",
      metadataDigest: new Uint8Array(32),
      rawImageDigest: fromHex(logo.raw),
      pixelImageDigest: fromHex(logo.pixel),
      perceptualHash: fromHex(logo.perceptual),
      nonce: randomBytes(32),
      signerKeyVersion: 1,
      expirySlot: 10_000n,
      ...over,
    };
  }

  it("accepts a correctly bound attestation and rejects a wrongly bound or untrusted one", () => {
    const reg = new Registry(new MemoryStore(), { namespaceLabel: "solana-devnet", network: "solana-devnet", trustedAttesters: [attesterPub] });
    const alice = wallet();
    const mint = mintAddr();
    const sub = { name: "Attested", ticker: "ATT", image: logo, metadataUri: "ipfs://bafy.../metadata.json" };

    // missing
    let r = reg.register(sub, { policy: "strict-any-v1", controller: alice, mint, slot: 5 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "ATTESTATION_INVALID");

    // bound to a different mint
    const wrongMint = signAttestation(stmt(reg, alice, mintAddr()), attesterSecret);
    r = reg.register(sub, { policy: "strict-any-v1", controller: alice, mint, slot: 5, attestation: wrongMint });
    assert.equal(r.ok, false);

    // signed by an untrusted key
    const rogue = signAttestation(stmt(reg, alice, mint), randomSecretKey());
    r = reg.register(sub, { policy: "strict-any-v1", controller: alice, mint, slot: 5, attestation: rogue });
    assert.equal(r.ok, false);

    // expired
    const expired = signAttestation(stmt(reg, alice, mint, { expirySlot: 4n }), attesterSecret);
    r = reg.register(sub, { policy: "strict-any-v1", controller: alice, mint, slot: 5, attestation: expired });
    assert.equal(r.ok, false);

    // correct
    const good = signAttestation(stmt(reg, alice, mint), attesterSecret);
    r = reg.register(sub, { policy: "strict-any-v1", controller: alice, mint, slot: 5, attestation: good });
    assert.ok(r.ok, JSON.stringify(r));

    // reused for a different applicant
    r = reg.register({ ...sub, name: "Attested Two", ticker: "ATT2" }, { policy: "strict-any-v1", controller: wallet(), mint: mintAddr(), slot: 6, attestation: good });
    assert.equal(r.ok, false);
  });
});

describe("Commitments", () => {
  it("verifies reveal timing and binding", () => {
    const reg = new Registry(new MemoryStore(), { namespaceLabel: "solana-devnet", network: "solana-devnet" });
    const applicant = randomBytes(32);
    const intendedMint = randomBytes(32);
    const salt = randomBytes(32);
    const inputs = { namespace: reg.namespace, policy: "strict-any-v1" as const, applicant, intendedMint, nameKey: "VAMPLESS", tickerKey: "VAMP", salt };
    const commitment = computeCommitment(inputs);
    const rec = { commitment, applicant, intendedMint, createdSlot: 100, expirySlot: 1600, consumed: false };

    assert.equal(verifyCommitmentReveal(rec, inputs, 101).ok, false, "too early");
    assert.equal(verifyCommitmentReveal(rec, inputs, 102).ok, true);
    assert.equal(verifyCommitmentReveal(rec, inputs, 1700).ok, false, "expired");
    assert.equal(verifyCommitmentReveal(rec, { ...inputs, tickerKey: "VAMQ" }, 102).ok, false, "different fields");
    assert.equal(verifyCommitmentReveal({ ...rec, consumed: true }, inputs, 102).ok, false, "consumed");
  });
});
