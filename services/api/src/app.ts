import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  b58,
  fingerprintToJson,
  fromHex,
  POLICIES,
  publicKeyFromSecret,
  randomBytes,
  Registry,
  signAttestation,
  toHex,
  type AttestationStatement,
  type ImageDigests,
  type PolicyId,
  type SignedAttestation,
} from "@vampless/core";
import { fingerprintFile } from "@vampless/core/node";

export interface AppDeps {
  registry: Registry;
  /** Ed25519 secret key of this attester instance. */
  attesterSecret: Uint8Array;
  /** Current slot source (RPC in production, simulated in the pilot). */
  currentSlot: () => number;
  /** Shared secret for ingest/admin endpoints. */
  adminKey?: string;
  /** Attestation validity window in slots. */
  attestationTtlSlots?: number;
}

const isPolicy = (p: unknown): p is PolicyId => typeof p === "string" && p in POLICIES;
const isHex = (s: unknown, bytes: number) => typeof s === "string" && new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(s);
const isB58 = (s: unknown) => typeof s === "string" && s.length >= 32 && s.length <= 44;

function parseImage(x: unknown): ImageDigests | undefined | "invalid" {
  if (x === undefined || x === null) return undefined;
  if (typeof x !== "object") return "invalid";
  const o = x as Record<string, unknown>;
  if (!isHex(o.raw, 32) || !isHex(o.pixel, 32) || !isHex(o.perceptual, 8)) return "invalid";
  return { raw: o.raw as string, pixel: o.pixel as string, perceptual: o.perceptual as string };
}

function serializeAttestation(a: SignedAttestation) {
  const s = a.statement;
  return {
    statement: {
      version: s.version,
      namespace: toHex(s.namespace),
      network: s.network,
      policy: s.policy,
      pipeline: s.pipeline,
      applicant: b58.encode(s.applicant),
      intendedMint: b58.encode(s.intendedMint),
      metadataUri: s.metadataUri,
      metadataDigest: toHex(s.metadataDigest),
      rawImageDigest: toHex(s.rawImageDigest),
      pixelImageDigest: toHex(s.pixelImageDigest),
      perceptualHash: toHex(s.perceptualHash),
      nonce: toHex(s.nonce),
      signerKeyVersion: s.signerKeyVersion,
      expirySlot: s.expirySlot.toString(),
    },
    signature: toHex(a.signature),
    signer: b58.encode(a.signer),
  };
}

function deserializeAttestation(x: unknown): SignedAttestation | null {
  try {
    const o = x as { statement: Record<string, unknown>; signature: string; signer: string };
    const s = o.statement;
    const statement: AttestationStatement = {
      version: Number(s.version),
      namespace: fromHex(s.namespace as string),
      network: s.network as string,
      policy: s.policy as PolicyId,
      pipeline: s.pipeline as string,
      applicant: b58.decode(s.applicant as string),
      intendedMint: b58.decode(s.intendedMint as string),
      metadataUri: s.metadataUri as string,
      metadataDigest: fromHex(s.metadataDigest as string),
      rawImageDigest: fromHex(s.rawImageDigest as string),
      pixelImageDigest: fromHex(s.pixelImageDigest as string),
      perceptualHash: fromHex(s.perceptualHash as string),
      nonce: fromHex(s.nonce as string),
      signerKeyVersion: Number(s.signerKeyVersion),
      expirySlot: BigInt(s.expirySlot as string),
    };
    return { statement, signature: fromHex(o.signature), signer: b58.decode(o.signer) };
  } catch {
    return null;
  }
}

export function createApp(deps: AppDeps) {
  const { registry } = deps;
  const attesterPub = publicKeyFromSecret(deps.attesterSecret);
  const ttl = deps.attestationTtlSlots ?? 300;
  const app = new Hono();

  app.use("*", cors());
  app.use("*", logger());

  const requireAdmin = (key: string | undefined) => !deps.adminKey || key === deps.adminKey;

  app.get("/", (c) =>
    c.json({
      service: "vampless-api",
      namespace: registry.namespaceHex,
      network: registry.network,
      attester: b58.encode(attesterPub),
      policies: POLICIES,
      endpoints: ["/v1/health", "/v1/check", "/v1/inspect", "/v1/attest", "/v1/register", "/v1/resolve/:mint", "/v1/identities", "/v1/observed", "/v1/disputes", "/v1/stats"],
    }),
  );

  app.get("/v1/health", (c) => c.json({ ok: true, slot: deps.currentSlot(), freshness: registry.freshness() }));
  app.get("/v1/stats", (c) => c.json({ ...registry.freshness(), slot: deps.currentSlot(), disputes: registry.listDisputes().length }));

  // ---- checkIdentity -------------------------------------------------------
  app.post("/v1/check", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.name !== "string" || typeof body.ticker !== "string") return c.json({ ok: false, code: "BAD_REQUEST", reason: "name and ticker are required" }, 400);
    const policy: PolicyId = isPolicy(body.policy) ? body.policy : "observe";
    const image = parseImage(body.image);
    if (image === "invalid") return c.json({ ok: false, code: "INVALID_IMAGE", reason: "image digests malformed" }, 400);
    const r = registry.check({ name: body.name, ticker: body.ticker, ...(image ? { image } : {}) }, policy);
    return c.json(r, r.ok ? 200 : 422);
  });

  // ---- inspect: fingerprint an uploaded image and preflight -----------------
  app.post("/v1/inspect", async (c) => {
    const form = await c.req.parseBody().catch(() => null);
    const file = form?.image;
    if (!(file instanceof File)) return c.json({ ok: false, code: "BAD_REQUEST", reason: "multipart field 'image' required" }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fp = fingerprintFile(bytes);
    if (!fp.ok) return c.json(fp, 422);
    const j = fingerprintToJson(fp.fingerprint);
    const name = typeof form?.name === "string" ? form.name : undefined;
    const ticker = typeof form?.ticker === "string" ? form.ticker : undefined;
    const policy: PolicyId = isPolicy(form?.policy) ? (form!.policy as PolicyId) : "observe";
    const check = name && ticker ? registry.check({ name, ticker, image: { raw: j.raw, pixel: j.pixel, perceptual: j.perceptual } }, policy) : null;
    return c.json({ ok: true, fingerprint: j, format: fp.format, check });
  });

  // ---- attestContent --------------------------------------------------------
  app.post("/v1/attest", async (c) => {
    const form = await c.req.parseBody().catch(() => null);
    const file = form?.image;
    if (!(file instanceof File)) return c.json({ ok: false, code: "BAD_REQUEST", reason: "multipart field 'image' required" }, 400);
    const applicant = form?.applicant;
    const intendedMint = form?.intendedMint;
    const policy = form?.policy;
    const metadataUri = typeof form?.metadataUri === "string" ? form.metadataUri : "";
    const metadataDigest = typeof form?.metadataDigest === "string" && isHex(form.metadataDigest, 32) ? form.metadataDigest : toHex(new Uint8Array(32));
    if (!isB58(applicant) || !isB58(intendedMint)) return c.json({ ok: false, code: "BAD_REQUEST", reason: "applicant and intendedMint (base58) required" }, 400);
    if (!isPolicy(policy) || !POLICIES[policy].enforced) return c.json({ ok: false, code: "BAD_REQUEST", reason: "an enforced policy is required" }, 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const fp = fingerprintFile(bytes);
    if (!fp.ok) return c.json({ ok: false, code: "CANNOT_ATTEST", reason: fp.reason }, 422);
    const j = fingerprintToJson(fp.fingerprint);

    const slot = deps.currentSlot();
    const statement: AttestationStatement = {
      version: 1,
      namespace: registry.namespace,
      network: registry.network,
      policy,
      pipeline: fp.fingerprint.pipeline,
      applicant: b58.decode(applicant as string),
      intendedMint: b58.decode(intendedMint as string),
      metadataUri,
      metadataDigest: fromHex(metadataDigest),
      rawImageDigest: fp.fingerprint.raw,
      pixelImageDigest: fp.fingerprint.pixel,
      perceptualHash: fp.fingerprint.perceptual,
      nonce: randomBytes(32),
      signerKeyVersion: 1,
      expirySlot: BigInt(slot + ttl),
    };
    const signed = signAttestation(statement, deps.attesterSecret);
    return c.json({ ok: true, fingerprint: j, attestation: serializeAttestation(signed), issuedSlot: slot });
  });

  // ---- register (pilot ledger) ----------------------------------------------
  app.post("/v1/register", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, code: "BAD_REQUEST", reason: "json body required" }, 400);
    if (typeof body.name !== "string" || typeof body.ticker !== "string") return c.json({ ok: false, code: "BAD_REQUEST", reason: "name and ticker required" }, 400);
    if (!isPolicy(body.policy)) return c.json({ ok: false, code: "BAD_REQUEST", reason: "policy required" }, 400);
    if (!isB58(body.controller)) return c.json({ ok: false, code: "BAD_REQUEST", reason: "controller (base58) required" }, 400);
    const mint = body.mint === null || body.mint === undefined ? null : isB58(body.mint) ? (body.mint as string) : "invalid";
    if (mint === "invalid") return c.json({ ok: false, code: "BAD_REQUEST", reason: "mint must be base58" }, 400);
    const image = parseImage(body.image);
    if (image === "invalid") return c.json({ ok: false, code: "INVALID_IMAGE", reason: "image digests malformed" }, 400);
    const attestation = body.attestation ? deserializeAttestation(body.attestation) : undefined;
    if (body.attestation && !attestation) return c.json({ ok: false, code: "ATTESTATION_INVALID", reason: "attestation malformed" }, 400);

    const r = registry.register(
      {
        name: body.name,
        ticker: body.ticker,
        ...(image ? { image } : {}),
        ...(typeof body.metadataUri === "string" ? { metadataUri: body.metadataUri } : {}),
        ...(isHex(body.metadataDigest, 32) ? { metadataDigest: body.metadataDigest } : {}),
      },
      {
        policy: body.policy,
        controller: body.controller,
        mint,
        slot: deps.currentSlot(),
        ...(typeof body.launchpad === "string" ? { launchpad: body.launchpad } : {}),
        ...(attestation ? { attestation } : {}),
      },
    );
    return c.json(r, r.ok ? 201 : r.code === "CONFLICT" ? 409 : 422);
  });

  // ---- resolveMint / identities ---------------------------------------------
  app.get("/v1/resolve/:mint", (c) => c.json(registry.resolveMint(c.req.param("mint"))));
  app.get("/v1/identities", (c) => {
    const q = (c.req.query("q") ?? "").toUpperCase();
    const all = registry.listIdentities();
    const items = q ? all.filter((i) => i.display.name.includes(q) || i.display.ticker.includes(q) || i.mint?.includes(q) || i.id.startsWith(q.toLowerCase())) : all;
    return c.json({ items: items.slice(-200).reverse(), total: all.length });
  });
  app.get("/v1/identities/:id", (c) => {
    const id = registry.getIdentity(c.req.param("id"));
    if (!id) return c.json({ ok: false, code: "NOT_FOUND" }, 404);
    return c.json({ identity: id, claims: registry.claimsOf(id.id), disputes: registry.listDisputes(id.id) });
  });

  // ---- observed index -------------------------------------------------------
  app.get("/v1/observed", (c) => {
    const all = registry.listObserved();
    return c.json({ items: all.slice(-200).reverse(), total: all.length, freshness: registry.freshness() });
  });
  app.post("/v1/observe", async (c) => {
    if (!requireAdmin(c.req.header("x-admin-key"))) return c.json({ ok: false, code: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => null);
    const items: unknown[] = Array.isArray(body) ? body : body ? [body] : [];
    const out = [];
    for (const it of items) {
      const o = it as Record<string, unknown>;
      if (!isB58(o.mint) || typeof o.name !== "string" || typeof o.ticker !== "string") continue;
      out.push(
        registry.observe({
          mint: o.mint as string,
          name: o.name,
          ticker: o.ticker,
          slot: typeof o.slot === "number" ? o.slot : deps.currentSlot(),
          source: typeof o.source === "string" ? o.source : "manual",
          ...(isHex(o.rawImage, 32) ? { rawImage: o.rawImage as string } : {}),
          ...(isHex(o.pixelImage, 32) ? { pixelImage: o.pixelImage as string } : {}),
          ...(isHex(o.perceptual, 8) ? { perceptual: o.perceptual as string } : {}),
          ...(typeof o.program === "string" ? { program: o.program } : {}),
        }),
      );
    }
    return c.json({ ok: true, ingested: out.length, freshness: registry.freshness() });
  });

  // ---- disputes -------------------------------------------------------------
  app.get("/v1/disputes", (c) => c.json({ items: registry.listDisputes() }));
  app.post("/v1/disputes", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || !isHex(body.identityId, 32) || !isB58(body.claimant) || !isHex(body.evidenceDigest, 32))
      return c.json({ ok: false, code: "BAD_REQUEST", reason: "identityId, claimant, evidenceDigest required" }, 400);
    try {
      const d = registry.openDispute(body.identityId, body.claimant, body.evidenceDigest, deps.currentSlot());
      return c.json({ ok: true, dispute: d }, 201);
    } catch (e) {
      return c.json({ ok: false, code: "NOT_FOUND", reason: (e as Error).message }, 404);
    }
  });
  app.post("/v1/disputes/:id/resolve", async (c) => {
    if (!requireAdmin(c.req.header("x-admin-key"))) return c.json({ ok: false, code: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.upheld !== "boolean" || !isB58(body.authority)) return c.json({ ok: false, code: "BAD_REQUEST" }, 400);
    try {
      const d = registry.resolveDispute(c.req.param("id"), body.upheld, body.authority, String(body.decision ?? ""), deps.currentSlot());
      return c.json({ ok: true, dispute: d });
    } catch (e) {
      return c.json({ ok: false, code: "NOT_FOUND", reason: (e as Error).message }, 404);
    }
  });
  app.post("/v1/identities/:id/clear-review", async (c) => {
    if (!requireAdmin(c.req.header("x-admin-key"))) return c.json({ ok: false, code: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({}));
    try {
      const id = registry.clearReview(c.req.param("id"), String(body.authority ?? "admin"), deps.currentSlot(), String(body.note ?? ""));
      return c.json({ ok: true, identity: id });
    } catch (e) {
      return c.json({ ok: false, code: "BAD_REQUEST", reason: (e as Error).message }, 400);
    }
  });

  return app;
}
