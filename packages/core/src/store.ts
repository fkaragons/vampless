import type { FieldName } from "./claims.ts";
import type { ClaimRecord, DisputeRecord, Hex, IdentityRecord, ObservedToken } from "./types.ts";

/**
 * Storage primitives behind the registry. All operations are synchronous so
 * `transaction` can provide all-or-nothing semantics in both the in-memory
 * store (used in the browser demo and tests) and the SQLite store (API).
 *
 * The on-chain program is the authoritative implementation of the same
 * contract: claim accounts are PDAs and the transaction is the unit of
 * atomicity.
 */
export interface RegistryStore {
  transaction<T>(fn: () => T): T;

  getClaim(key: Hex): ClaimRecord | undefined;
  putClaim(claim: ClaimRecord): void;
  listClaims(identityId: Hex): ClaimRecord[];

  getIdentity(id: Hex): IdentityRecord | undefined;
  putIdentity(identity: IdentityRecord): void;
  getIdentityByMint(mint: string): IdentityRecord | undefined;
  listIdentities(): IdentityRecord[];

  getObserved(mint: string): ObservedToken | undefined;
  putObserved(token: ObservedToken): void;
  findObserved(field: FieldName, value: string): ObservedToken[];
  listObserved(): ObservedToken[];

  putDispute(d: DisputeRecord): void;
  getDispute(id: Hex): DisputeRecord | undefined;
  listDisputes(identityId?: Hex): DisputeRecord[];

  /** Highest slot seen by the observed index, or 0. */
  indexedSlot(): number;
  setIndexedSlot(slot: number): void;
}

export class MemoryStore implements RegistryStore {
  private claims = new Map<Hex, ClaimRecord>();
  private identities = new Map<Hex, IdentityRecord>();
  private mintIndex = new Map<string, Hex>();
  private observed = new Map<string, ObservedToken>();
  private disputes = new Map<Hex, DisputeRecord>();
  private _indexedSlot = 0;
  private depth = 0;

  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    // Snapshot for rollback. Records are treated as immutable values, so
    // shallow copies of the maps are sufficient.
    const snap = {
      claims: new Map(this.claims),
      identities: new Map(this.identities),
      mintIndex: new Map(this.mintIndex),
      observed: new Map(this.observed),
      disputes: new Map(this.disputes),
      indexedSlot: this._indexedSlot,
    };
    this.depth++;
    try {
      return fn();
    } catch (e) {
      this.claims = snap.claims;
      this.identities = snap.identities;
      this.mintIndex = snap.mintIndex;
      this.observed = snap.observed;
      this.disputes = snap.disputes;
      this._indexedSlot = snap.indexedSlot;
      throw e;
    } finally {
      this.depth--;
    }
  }

  getClaim(key: Hex) {
    return this.claims.get(key);
  }
  putClaim(claim: ClaimRecord) {
    this.claims.set(claim.key, claim);
  }
  listClaims(identityId: Hex) {
    return [...this.claims.values()].filter((c) => c.identityId === identityId);
  }

  getIdentity(id: Hex) {
    return this.identities.get(id);
  }
  putIdentity(identity: IdentityRecord) {
    const prev = this.identities.get(identity.id);
    if (prev?.mint && prev.mint !== identity.mint) this.mintIndex.delete(prev.mint);
    this.identities.set(identity.id, identity);
    if (identity.mint && identity.status !== "historical") this.mintIndex.set(identity.mint, identity.id);
  }
  getIdentityByMint(mint: string) {
    const id = this.mintIndex.get(mint);
    if (id) return this.identities.get(id);
    // historical bindings
    for (const i of this.identities.values()) if (i.mint === mint) return i;
    return undefined;
  }
  listIdentities() {
    return [...this.identities.values()].sort((a, b) => a.registeredSlot - b.registeredSlot);
  }

  getObserved(mint: string) {
    return this.observed.get(mint);
  }
  putObserved(token: ObservedToken) {
    this.observed.set(token.mint, token);
    if (token.slot > this._indexedSlot) this._indexedSlot = token.slot;
  }
  findObserved(field: FieldName, value: string) {
    const out: ObservedToken[] = [];
    for (const t of this.observed.values()) {
      const v =
        field === "name" ? t.nameKey : field === "ticker" ? t.tickerKey : field === "rawImage" ? t.rawImage : t.pixelImage;
      if (v && v === value) out.push(t);
    }
    return out.sort((a, b) => a.slot - b.slot);
  }
  listObserved() {
    return [...this.observed.values()].sort((a, b) => a.slot - b.slot);
  }

  putDispute(d: DisputeRecord) {
    this.disputes.set(d.id, d);
  }
  getDispute(id: Hex) {
    return this.disputes.get(id);
  }
  listDisputes(identityId?: Hex) {
    const all = [...this.disputes.values()];
    return identityId ? all.filter((d) => d.identityId === identityId) : all;
  }

  indexedSlot() {
    return this._indexedSlot;
  }
  setIndexedSlot(slot: number) {
    this._indexedSlot = Math.max(this._indexedSlot, slot);
  }
}
