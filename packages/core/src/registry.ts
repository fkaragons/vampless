import { type SignedAttestation, verifyAttestation } from "./attestation.ts";
import { FieldTag, imageClaimKey, textClaimKey, type FieldName } from "./claims.ts";
import { fromHex, lenStr, toHex, u64le, utf8 } from "./encoding.ts";
import { b58, domainHash, namespaceId } from "./hash.ts";
import { hammingDistance, PERCEPTUAL_REVIEW_THRESHOLD } from "./image.ts";
import { confusableSkeleton, normalizeName, normalizeTicker } from "./normalize.ts";
import { evaluatePolicy } from "./policy.ts";
import type { RegistryStore } from "./store.ts";
import {
  POLICIES,
  type CheckError,
  type CheckResult,
  type ClaimRecord,
  type Decision,
  type DisputeRecord,
  type Freshness,
  type Hex,
  type IdentityRecord,
  type Match,
  type NormalizedSubmission,
  type ObservedToken,
  type PolicyId,
  type RegisterResult,
  type Submission,
} from "./types.ts";

export interface RegistryConfig {
  /** Human label, e.g. "solana-devnet". Namespace id is derived from it. */
  namespaceLabel: string;
  network: string;
  /** Ed25519 public keys of trusted image attesters. */
  trustedAttesters?: Uint8Array[];
}

export interface RegisterOptions {
  policy: PolicyId;
  /** base58 controller wallet */
  controller: string;
  /** base58 mint being bound (may be null for a pre-launch reservation) */
  mint: string | null;
  slot: number;
  launchpad?: string;
  /** Required when the policy is enforced and an image is present and attesters are configured. */
  attestation?: SignedAttestation;
}

/**
 * Registry logic shared by the browser demo (MemoryStore) and the API
 * (SqliteStore). The Rust program is the authoritative on-chain version of
 * `register`; this class exists so every consumer can preflight with the same
 * rules and so the pilot can run end-to-end before devnet deployment.
 */
export class Registry {
  readonly namespace: Uint8Array;
  readonly namespaceHex: Hex;
  readonly network: string;
  private trusted: Uint8Array[];
  readonly store: RegistryStore;

  constructor(store: RegistryStore, cfg: RegistryConfig) {
    this.store = store;
    this.namespace = namespaceId(cfg.namespaceLabel);
    this.namespaceHex = toHex(this.namespace);
    this.network = cfg.network;
    this.trusted = cfg.trustedAttesters ?? [];
  }

  // -------------------------------------------------------------------------
  // Normalization
  // -------------------------------------------------------------------------

  normalize(sub: Submission): NormalizedSubmission | CheckError {
    const name = normalizeName(sub.name);
    if (!name.ok) return { ok: false, code: "INVALID_NAME", reason: name.reason };
    const ticker = normalizeTicker(sub.ticker);
    if (!ticker.ok) return { ok: false, code: "INVALID_TICKER", reason: ticker.reason };
    if (sub.image) {
      if (sub.image.raw.length !== 64 || sub.image.pixel.length !== 64 || sub.image.perceptual.length !== 16)
        return { ok: false, code: "INVALID_IMAGE", reason: "image digests must be raw(32B) pixel(32B) perceptual(8B) hex" };
    }
    const out: NormalizedSubmission = {
      name: { display: name.display, key: name.key },
      ticker: { display: ticker.display, key: ticker.key },
      confusable: { name: confusableSkeleton(sub.name), ticker: confusableSkeleton(sub.ticker) },
    };
    if (sub.image) out.image = sub.image;
    if (sub.metadataUri !== undefined) out.metadataUri = sub.metadataUri;
    if (sub.metadataDigest !== undefined) out.metadataDigest = sub.metadataDigest;
    return out;
  }

  // -------------------------------------------------------------------------
  // Claim keys
  // -------------------------------------------------------------------------

  claimKeyFor(field: FieldName, value: string): Hex {
    switch (field) {
      case "name":
        return toHex(textClaimKey(this.namespace, FieldTag.Name, value));
      case "ticker":
        return toHex(textClaimKey(this.namespace, FieldTag.Ticker, value));
      case "rawImage":
        return toHex(imageClaimKey(this.namespace, FieldTag.RawImage, fromHex(value)));
      case "pixelImage":
        return toHex(imageClaimKey(this.namespace, FieldTag.PixelImage, fromHex(value)));
    }
  }

  private fieldValues(n: NormalizedSubmission): Array<[FieldName, string]> {
    const out: Array<[FieldName, string]> = [
      ["name", n.name.key],
      ["ticker", n.ticker.key],
    ];
    if (n.image) {
      out.push(["rawImage", n.image.raw]);
      out.push(["pixelImage", n.image.pixel]);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Matching
  // -------------------------------------------------------------------------

  /** Collect every exact and fuzzy signal; policy classification happens later. */
  collectMatches(n: NormalizedSubmission, opts: { excludeIdentity?: Hex } = {}): Match[] {
    const matches: Match[] = [];

    for (const [field, value] of this.fieldValues(n)) {
      const claim = this.store.getClaim(this.claimKeyFor(field, value));
      if (claim && claim.identityId !== opts.excludeIdentity) {
        const id = this.store.getIdentity(claim.identityId);
        matches.push({
          field,
          kind: "registered",
          identityId: claim.identityId,
          identityStatus: id?.status ?? "registered",
          mint: id?.mint ?? null,
          slot: claim.slot,
          detail: `${field} "${describe(field, value)}" is claimed by identity ${claim.identityId.slice(0, 8)}`,
        });
      }
      for (const t of this.store.findObserved(field, value)) {
        matches.push({
          field,
          kind: "observed",
          mint: t.mint,
          source: t.source,
          slot: t.slot,
          detail: `${field} "${describe(field, value)}" observed on mint ${t.mint.slice(0, 6)}… via ${t.source} at slot ${t.slot}`,
        });
      }
    }

    // Perceptual similarity (review only)
    if (n.image) {
      const ph = fromHex(n.image.perceptual);
      const exactPixel = new Set(matches.filter((m) => m.field === "pixelImage" || m.field === "rawImage").map((m) => m.identityId ?? m.mint));
      for (const id of this.store.listIdentities()) {
        if (!id.perceptual || id.id === opts.excludeIdentity || exactPixel.has(id.id)) continue;
        const d = hammingDistance(ph, fromHex(id.perceptual));
        if (d <= PERCEPTUAL_REVIEW_THRESHOLD)
          matches.push({
            field: "perceptual",
            kind: "registered",
            identityId: id.id,
            identityStatus: id.status,
            mint: id.mint,
            slot: id.registeredSlot,
            distance: d,
            detail: `image is visually similar (distance ${d}) to registered identity ${id.display.name}; similarity is not equality — review required`,
          });
      }
      for (const t of this.store.listObserved()) {
        if (!t.perceptual || exactPixel.has(t.mint)) continue;
        const d = hammingDistance(ph, fromHex(t.perceptual));
        if (d <= PERCEPTUAL_REVIEW_THRESHOLD)
          matches.push({
            field: "perceptual",
            kind: "observed",
            mint: t.mint,
            source: t.source,
            slot: t.slot,
            distance: d,
            detail: `image is visually similar (distance ${d}) to observed mint ${t.mint.slice(0, 6)}… (${t.source})`,
          });
      }
    }

    // Confusables (review only) — only against registered identities whose
    // canonical key differs from ours (same key is already an exact match).
    for (const id of this.store.listIdentities()) {
      if (id.id === opts.excludeIdentity) continue;
      if (id.keys.name !== n.name.key && confusableSkeleton(id.display.name) === n.confusable.name)
        matches.push({
          field: "confusable-name",
          kind: "registered",
          identityId: id.id,
          identityStatus: id.status,
          mint: id.mint,
          slot: id.registeredSlot,
          detail: `name is a visual lookalike of registered "${id.display.name}" (confusables-v1); review required`,
        });
      if (id.keys.ticker !== n.ticker.key && confusableSkeleton(id.display.ticker) === n.confusable.ticker)
        matches.push({
          field: "confusable-ticker",
          kind: "registered",
          identityId: id.id,
          identityStatus: id.status,
          mint: id.mint,
          slot: id.registeredSlot,
          detail: `ticker is a visual lookalike of registered "${id.display.ticker}" (confusables-v1); review required`,
        });
    }

    return matches;
  }

  freshness(): Freshness {
    const observed = this.store.listObserved();
    const first = observed[0];
    const last = observed[observed.length - 1];
    return {
      indexedSlot: this.store.indexedSlot(),
      observedCount: observed.length,
      identityCount: this.store.listIdentities().length,
      coverage: first && last ? { fromSlot: first.slot, toSlot: last.slot } : null,
    };
  }

  /** Preflight. Reserves nothing. */
  check(sub: Submission, policy: PolicyId): CheckResult | CheckError {
    const n = this.normalize(sub);
    if ("ok" in n) return n;
    const decision = evaluatePolicy(policy, this.collectMatches(n));
    return { ok: true, normalized: n, decision, freshness: this.freshness() };
  }

  // -------------------------------------------------------------------------
  // Registration (atomic)
  // -------------------------------------------------------------------------

  register(sub: Submission, opts: RegisterOptions): RegisterResult {
    const n = this.normalize(sub);
    if ("ok" in n) return n;

    if (!POLICIES[opts.policy].enforced)
      return { ok: false, code: "POLICY_NOT_ENFORCED", reason: `policy "${opts.policy}" cannot register identities; it only observes` };

    if (opts.mint) {
      const bound = this.store.getIdentityByMint(opts.mint);
      if (bound && bound.status !== "historical")
        return { ok: false, code: "MINT_ALREADY_BOUND", reason: "mint is already bound to an identity", identityId: bound.id };
    }

    // Attestation: required when an image is present and attesters are configured.
    if (n.image && this.trusted.length) {
      if (!opts.attestation) return { ok: false, code: "ATTESTATION_INVALID", reason: "image attestation required" };
      const check = verifyAttestation(opts.attestation, {
        namespace: this.namespace,
        network: this.network,
        policy: opts.policy,
        applicant: b58.decode(opts.controller),
        intendedMint: opts.mint ? b58.decode(opts.mint) : new Uint8Array(32),
        metadataUri: n.metadataUri ?? "",
        metadataDigest: n.metadataDigest ? fromHex(n.metadataDigest) : new Uint8Array(32),
        rawImageDigest: fromHex(n.image.raw),
        pixelImageDigest: fromHex(n.image.pixel),
        currentSlot: opts.slot,
        trustedSigners: this.trusted,
      });
      if (!check.ok) return { ok: false, code: "ATTESTATION_INVALID", reason: check.reason };
    }

    try {
      return this.store.transaction(() => {
        // Re-collect inside the transaction: the decision must be made against
        // the state we are about to mutate, exactly as a program would contend
        // on the claim accounts themselves.
        const decision = evaluatePolicy(opts.policy, this.collectMatches(n));
        if (decision.status === "conflict") throw new ConflictSignal(decision);

        const id = toHex(
          domainHash(
            "vampless/identity/v1",
            this.namespace,
            b58.decode(opts.controller),
            lenStr(n.name.key),
            lenStr(n.ticker.key),
            u64le(opts.slot),
            utf8(opts.mint ?? ""),
          ),
        );

        const claims: ClaimRecord[] = this.fieldValues(n).map(([field, value]) => ({
          key: this.claimKeyFor(field, value),
          field,
          identityId: id,
          value,
          slot: opts.slot,
        }));
        for (const c of claims) {
          if (this.store.getClaim(c.key)) throw new ConflictSignal(decision); // defensive double-check
          this.store.putClaim(c);
        }

        const status = decision.status === "needs_review" ? "needs_review" : "registered";
        const identity: IdentityRecord = {
          id,
          namespace: this.namespaceHex,
          network: this.network,
          policy: opts.policy,
          controller: opts.controller,
          mint: opts.mint,
          display: { name: n.name.display, ticker: n.ticker.display },
          keys: {
            name: n.name.key,
            ticker: n.ticker.key,
            ...(n.image ? { rawImage: n.image.raw, pixelImage: n.image.pixel } : {}),
          },
          registeredSlot: opts.slot,
          status,
          history: [
            { slot: opts.slot, event: "registered", authority: opts.controller },
            ...(status === "needs_review"
              ? [{ slot: opts.slot, event: "review_requested" as const, detail: decision.reasons.join(" ") }]
              : []),
          ],
        };
        if (opts.launchpad) identity.launchpad = opts.launchpad;
        if (n.image) identity.perceptual = n.image.perceptual;
        if (n.metadataUri !== undefined) identity.metadataUri = n.metadataUri;
        if (n.metadataDigest !== undefined) identity.metadataDigest = n.metadataDigest;

        this.store.putIdentity(identity);
        return { ok: true, identity, decision, claims } satisfies RegisterResult;
      });
    } catch (e) {
      if (e instanceof ConflictSignal)
        return { ok: false, code: "CONFLICT", reason: e.decision.reasons.join(" "), decision: e.decision };
      throw e;
    }
  }

  // -------------------------------------------------------------------------
  // Observed index
  // -------------------------------------------------------------------------

  observe(t: Omit<ObservedToken, "nameKey" | "tickerKey" | "network"> & { network?: string }): ObservedToken {
    const name = normalizeName(t.name);
    const ticker = normalizeTicker(t.ticker);
    const rec: ObservedToken = {
      ...t,
      network: t.network ?? this.network,
      nameKey: name.ok ? name.key : null,
      tickerKey: ticker.ok ? ticker.key : null,
    };
    this.store.putObserved(rec);
    return rec;
  }

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  resolveMint(mint: string) {
    const identity = this.store.getIdentityByMint(mint);
    const observed = this.store.getObserved(mint);
    let label: "registered" | "needs_review" | "disputed" | "historical" | "observed_conflict" | "observed" | "unknown" = "unknown";
    let conflicts: Match[] = [];
    if (identity) label = identity.status;
    else if (observed) {
      const n = this.normalize({ name: observed.name, ticker: observed.ticker, ...(observed.rawImage && observed.pixelImage && observed.perceptual ? { image: { raw: observed.rawImage, pixel: observed.pixelImage, perceptual: observed.perceptual } } : {}) });
      if (!("ok" in n)) {
        conflicts = this.collectMatches(n).filter((m) => m.mint !== mint);
        label = conflicts.some((m) => m.kind === "registered") ? "observed_conflict" : "observed";
      } else label = "observed";
    }
    return { mint, label, identity: identity ?? null, observed: observed ?? null, conflicts, freshness: this.freshness() };
  }

  getIdentity(id: Hex) {
    return this.store.getIdentity(id);
  }
  listIdentities() {
    return this.store.listIdentities();
  }
  listObserved() {
    return this.store.listObserved();
  }
  claimsOf(id: Hex) {
    return this.store.listClaims(id);
  }

  // -------------------------------------------------------------------------
  // Lifecycle: migration, disputes, review
  // -------------------------------------------------------------------------

  /** Controller-authorized migration to a new mint. Old binding becomes historical; claims stay. */
  migrate(identityId: Hex, newMint: string, controller: string, slot: number): IdentityRecord {
    const id = this.store.getIdentity(identityId);
    if (!id) throw new Error("identity not found");
    if (id.controller !== controller) throw new Error("only the controller can migrate");
    const bound = this.store.getIdentityByMint(newMint);
    if (bound && bound.status !== "historical" && bound.id !== identityId) throw new Error("new mint already bound");
    return this.store.transaction(() => {
      const historical: IdentityRecord = {
        ...id,
        id: toHex(domainHash("vampless/identity-historical/v1", fromHex(id.id), u64le(slot))),
        status: "historical",
        history: [...id.history, { slot, event: "marked_historical", detail: `migrated to ${newMint}`, authority: controller }],
      };
      // keep claims on the live identity; archive a historical copy of the old binding
      this.store.putIdentity(historical);
      const updated: IdentityRecord = {
        ...id,
        mint: newMint,
        history: [...id.history, { slot, event: "migrated", detail: `from ${id.mint ?? "unbound"} to ${newMint}`, authority: controller }],
      };
      this.store.putIdentity(updated);
      return updated;
    });
  }

  openDispute(identityId: Hex, claimant: string, evidenceDigest: Hex, slot: number): DisputeRecord {
    const id = this.store.getIdentity(identityId);
    if (!id) throw new Error("identity not found");
    return this.store.transaction(() => {
      const d: DisputeRecord = {
        id: toHex(domainHash("vampless/dispute/v1", fromHex(identityId), fromHex(evidenceDigest), u64le(slot))),
        identityId,
        openedSlot: slot,
        evidenceDigest,
        claimant,
        status: "open",
      };
      this.store.putDispute(d);
      this.store.putIdentity({ ...id, status: "disputed", history: [...id.history, { slot, event: "disputed", detail: d.id, authority: claimant }] });
      return d;
    });
  }

  resolveDispute(disputeId: Hex, upheld: boolean, authority: string, decision: string, slot: number): DisputeRecord {
    const d = this.store.getDispute(disputeId);
    if (!d) throw new Error("dispute not found");
    const id = this.store.getIdentity(d.identityId);
    if (!id) throw new Error("identity not found");
    return this.store.transaction(() => {
      const resolved: DisputeRecord = { ...d, status: upheld ? "upheld" : "rejected", resolvedSlot: slot, decision, authority };
      this.store.putDispute(resolved);
      const stillOpen = this.store.listDisputes(id.id).some((x) => x.id !== d.id && x.status === "open");
      this.store.putIdentity({
        ...id,
        status: upheld ? "historical" : stillOpen ? "disputed" : "registered",
        history: [...id.history, { slot, event: "dispute_resolved", detail: `${upheld ? "upheld" : "rejected"}: ${decision}`, authority }],
      });
      return resolved;
    });
  }

  clearReview(identityId: Hex, authority: string, slot: number, note: string): IdentityRecord {
    const id = this.store.getIdentity(identityId);
    if (!id) throw new Error("identity not found");
    if (id.status !== "needs_review") throw new Error("identity is not under review");
    const updated: IdentityRecord = { ...id, status: "registered", history: [...id.history, { slot, event: "review_cleared", detail: note, authority }] };
    this.store.putIdentity(updated);
    return updated;
  }

  listDisputes(identityId?: Hex) {
    return this.store.listDisputes(identityId);
  }
}

class ConflictSignal extends Error {
  readonly decision: Decision;
  constructor(decision: Decision) {
    super("conflict");
    this.decision = decision;
  }
}

function describe(field: FieldName, value: string): string {
  return field === "rawImage" || field === "pixelImage" ? `${value.slice(0, 8)}…` : value;
}
