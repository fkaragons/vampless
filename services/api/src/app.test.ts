import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { b58, MemoryStore, publicKeyFromSecret, randomBytes, randomSecretKey, Registry } from "@vampless/core";
import { encodePng } from "@vampless/core/node";
import { createApp } from "./app.ts";
import { SqliteStore } from "./sqlite-store.ts";

function logo(seed: number): Uint8Array {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = (x - 32) ** 2 + (y - 32) ** 2 < 400;
      data[i] = inside ? (90 + seed * 40) & 0xff : (x * 4) & 0xff;
      data[i + 1] = inside ? (200 - seed * 30) & 0xff : (y * 4) & 0xff;
      data[i + 2] = 120;
      data[i + 3] = 255;
    }
  return encodePng({ width: size, height: size, data });
}

function makeApp(store = new MemoryStore()) {
  const attesterSecret = randomSecretKey();
  const registry = new Registry(store, { namespaceLabel: "solana-devnet", network: "solana-devnet", trustedAttesters: [publicKeyFromSecret(attesterSecret)] });
  let slot = 1000;
  const app = createApp({ registry, attesterSecret, currentSlot: () => slot++, adminKey: "secret" });
  return { app, registry };
}

async function attestAndRegister(app: ReturnType<typeof makeApp>["app"], opts: { name: string; ticker: string; image: Uint8Array; controller: string; mint: string; launchpad: string }) {
  const form = new FormData();
  form.set("image", new Blob([opts.image], { type: "image/png" }), "logo.png");
  form.set("applicant", opts.controller);
  form.set("intendedMint", opts.mint);
  form.set("policy", "strict-any-v1");
  form.set("metadataUri", "ipfs://bafy/metadata.json");
  const att = await app.request("/v1/attest", { method: "POST", body: form });
  assert.equal(att.status, 200);
  const attJson = (await att.json()) as { fingerprint: { raw: string; pixel: string; perceptual: string }; attestation: unknown };

  const reg = await app.request("/v1/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: opts.name,
      ticker: opts.ticker,
      image: { raw: attJson.fingerprint.raw, pixel: attJson.fingerprint.pixel, perceptual: attJson.fingerprint.perceptual },
      metadataUri: "ipfs://bafy/metadata.json",
      policy: "strict-any-v1",
      controller: opts.controller,
      mint: opts.mint,
      launchpad: opts.launchpad,
      attestation: attJson.attestation,
    }),
  });
  return { status: reg.status, body: (await reg.json()) as Record<string, unknown> };
}

describe("API end-to-end (two launchpads, one registry)", () => {
  it("attests, registers on launchpad A, rejects duplicate on launchpad B, resolves the mint", async () => {
    const { app } = makeApp();
    const alice = b58.encode(randomBytes(32));
    const mallory = b58.encode(randomBytes(32));
    const mintA = b58.encode(randomBytes(32));
    const mintB = b58.encode(randomBytes(32));

    const first = await attestAndRegister(app, { name: "Vampless", ticker: "VAMP", image: logo(1), controller: alice, mint: mintA, launchpad: "launchpad-a" });
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const dup = await attestAndRegister(app, { name: "VAMP-LESS", ticker: "OTHER", image: logo(2), controller: mallory, mint: mintB, launchpad: "launchpad-b" });
    assert.equal(dup.status, 409);
    assert.equal((dup.body as { code: string }).code, "CONFLICT");

    const res = await app.request(`/v1/resolve/${mintA}`);
    const resolved = (await res.json()) as { label: string };
    assert.equal(resolved.label, "registered");

    const unknown = await app.request(`/v1/resolve/${mintB}`);
    assert.equal(((await unknown.json()) as { label: string }).label, "unknown");
  });

  it("rejects a registration whose attestation was issued for a different mint", async () => {
    const { app } = makeApp();
    const alice = b58.encode(randomBytes(32));
    const form = new FormData();
    form.set("image", new Blob([logo(3)], { type: "image/png" }), "logo.png");
    form.set("applicant", alice);
    form.set("intendedMint", b58.encode(randomBytes(32)));
    form.set("policy", "strict-any-v1");
    const att = (await (await app.request("/v1/attest", { method: "POST", body: form })).json()) as { fingerprint: Record<string, string>; attestation: unknown };
    const reg = await app.request("/v1/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", ticker: "X", image: att.fingerprint, policy: "strict-any-v1", controller: alice, mint: b58.encode(randomBytes(32)), attestation: att.attestation }),
    });
    assert.equal(reg.status, 422);
    assert.equal(((await reg.json()) as { code: string }).code, "ATTESTATION_INVALID");
  });

  it("check in observe mode reports observed conflicts without enforcing", async () => {
    const { app } = makeApp();
    const ingest = await app.request("/v1/observe", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": "secret" },
      body: JSON.stringify([{ mint: b58.encode(randomBytes(32)), name: "Pepe", ticker: "PEPE", slot: 10, source: "pump.fun" }]),
    });
    assert.equal(ingest.status, 200);
    const check = await app.request("/v1/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "pepe", ticker: "$PEPE", policy: "observe" }) });
    const j = (await check.json()) as { decision: { status: string; informational: unknown[] } };
    assert.equal(j.decision.status, "available");
    assert.equal(j.decision.informational.length, 2);

    const unauthorized = await app.request("/v1/observe", { method: "POST", headers: { "content-type": "application/json" }, body: "[]" });
    assert.equal(unauthorized.status, 401);
  });

  it("SQLite store rolls back a failed registration atomically", async () => {
    const store = new SqliteStore(":memory:");
    const { app, registry } = makeApp(store);
    const alice = b58.encode(randomBytes(32));
    const r1 = await attestAndRegister(app, { name: "Atomic", ticker: "ATOM", image: logo(4), controller: alice, mint: b58.encode(randomBytes(32)), launchpad: "a" });
    assert.equal(r1.status, 201);
    const r2 = await attestAndRegister(app, { name: "Different", ticker: "ATOM", image: logo(5), controller: alice, mint: b58.encode(randomBytes(32)), launchpad: "b" });
    assert.equal(r2.status, 409);
    const fresh = registry.check({ name: "Different", ticker: "FRESH" }, "strict-any-v1");
    assert.ok(fresh.ok && fresh.decision.status === "available");
    assert.equal(registry.listIdentities().length, 1);
    store.close();
  });
});
