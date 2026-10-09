import { DatabaseSync } from "node:sqlite";
import type { ClaimRecord, DisputeRecord, FieldName, Hex, IdentityRecord, ObservedToken, RegistryStore } from "@vampless/core";

/**
 * Durable store for the API. Same contract as MemoryStore; SQLite transactions
 * supply the all-or-nothing guarantee for `register`.
 */
export class SqliteStore implements RegistryStore {
  private db: DatabaseSync;
  private depth = 0;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS claims (
        key TEXT PRIMARY KEY, field TEXT NOT NULL, identity_id TEXT NOT NULL, value TEXT NOT NULL, slot INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS claims_identity ON claims(identity_id);
      CREATE TABLE IF NOT EXISTS identities (
        id TEXT PRIMARY KEY, mint TEXT, status TEXT NOT NULL, registered_slot INTEGER NOT NULL, perceptual TEXT, json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS identities_mint ON identities(mint);
      CREATE TABLE IF NOT EXISTS observed (
        mint TEXT PRIMARY KEY, name_key TEXT, ticker_key TEXT, raw_image TEXT, pixel_image TEXT, perceptual TEXT, slot INTEGER NOT NULL, json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS observed_name ON observed(name_key);
      CREATE INDEX IF NOT EXISTS observed_ticker ON observed(ticker_key);
      CREATE INDEX IF NOT EXISTS observed_raw ON observed(raw_image);
      CREATE INDEX IF NOT EXISTS observed_pixel ON observed(pixel_image);
      CREATE TABLE IF NOT EXISTS disputes (
        id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    `);
  }

  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    this.depth++;
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      this.depth--;
    }
  }

  getClaim(key: Hex): ClaimRecord | undefined {
    const row = this.db.prepare("SELECT key, field, identity_id, value, slot FROM claims WHERE key = ?").get(key) as
      | { key: string; field: string; identity_id: string; value: string; slot: number }
      | undefined;
    return row ? { key: row.key, field: row.field as FieldName, identityId: row.identity_id, value: row.value, slot: row.slot } : undefined;
  }
  putClaim(c: ClaimRecord) {
    this.db
      .prepare("INSERT INTO claims(key, field, identity_id, value, slot) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET field=excluded.field, identity_id=excluded.identity_id, value=excluded.value, slot=excluded.slot")
      .run(c.key, c.field, c.identityId, c.value, c.slot);
  }
  listClaims(identityId: Hex): ClaimRecord[] {
    const rows = this.db.prepare("SELECT key, field, identity_id, value, slot FROM claims WHERE identity_id = ?").all(identityId) as Array<{ key: string; field: string; identity_id: string; value: string; slot: number }>;
    return rows.map((r) => ({ key: r.key, field: r.field as FieldName, identityId: r.identity_id, value: r.value, slot: r.slot }));
  }

  getIdentity(id: Hex): IdentityRecord | undefined {
    const row = this.db.prepare("SELECT json FROM identities WHERE id = ?").get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as IdentityRecord) : undefined;
  }
  putIdentity(i: IdentityRecord) {
    this.db
      .prepare("INSERT INTO identities(id, mint, status, registered_slot, perceptual, json) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET mint=excluded.mint, status=excluded.status, registered_slot=excluded.registered_slot, perceptual=excluded.perceptual, json=excluded.json")
      .run(i.id, i.mint, i.status, i.registeredSlot, i.perceptual ?? null, JSON.stringify(i));
  }
  getIdentityByMint(mint: string): IdentityRecord | undefined {
    const row = this.db
      .prepare("SELECT json FROM identities WHERE mint = ? ORDER BY CASE status WHEN 'historical' THEN 1 ELSE 0 END, registered_slot DESC LIMIT 1")
      .get(mint) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as IdentityRecord) : undefined;
  }
  listIdentities(): IdentityRecord[] {
    const rows = this.db.prepare("SELECT json FROM identities ORDER BY registered_slot ASC").all() as Array<{ json: string }>;
    return rows.map((r) => JSON.parse(r.json) as IdentityRecord);
  }

  getObserved(mint: string): ObservedToken | undefined {
    const row = this.db.prepare("SELECT json FROM observed WHERE mint = ?").get(mint) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as ObservedToken) : undefined;
  }
  putObserved(t: ObservedToken) {
    this.db
      .prepare("INSERT INTO observed(mint, name_key, ticker_key, raw_image, pixel_image, perceptual, slot, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(mint) DO UPDATE SET name_key=excluded.name_key, ticker_key=excluded.ticker_key, raw_image=excluded.raw_image, pixel_image=excluded.pixel_image, perceptual=excluded.perceptual, slot=excluded.slot, json=excluded.json")
      .run(t.mint, t.nameKey, t.tickerKey, t.rawImage ?? null, t.pixelImage ?? null, t.perceptual ?? null, t.slot, JSON.stringify(t));
    this.setIndexedSlot(t.slot);
  }
  findObserved(field: FieldName, value: string): ObservedToken[] {
    const col = field === "name" ? "name_key" : field === "ticker" ? "ticker_key" : field === "rawImage" ? "raw_image" : "pixel_image";
    const rows = this.db.prepare(`SELECT json FROM observed WHERE ${col} = ? ORDER BY slot ASC`).all(value) as Array<{ json: string }>;
    return rows.map((r) => JSON.parse(r.json) as ObservedToken);
  }
  listObserved(): ObservedToken[] {
    const rows = this.db.prepare("SELECT json FROM observed ORDER BY slot ASC").all() as Array<{ json: string }>;
    return rows.map((r) => JSON.parse(r.json) as ObservedToken);
  }

  putDispute(d: DisputeRecord) {
    this.db.prepare("INSERT INTO disputes(id, identity_id, json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json=excluded.json").run(d.id, d.identityId, JSON.stringify(d));
  }
  getDispute(id: Hex): DisputeRecord | undefined {
    const row = this.db.prepare("SELECT json FROM disputes WHERE id = ?").get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as DisputeRecord) : undefined;
  }
  listDisputes(identityId?: Hex): DisputeRecord[] {
    const rows = (identityId
      ? this.db.prepare("SELECT json FROM disputes WHERE identity_id = ?").all(identityId)
      : this.db.prepare("SELECT json FROM disputes").all()) as Array<{ json: string }>;
    return rows.map((r) => JSON.parse(r.json) as DisputeRecord);
  }

  indexedSlot(): number {
    const row = this.db.prepare("SELECT v FROM meta WHERE k = 'indexed_slot'").get() as { v: string } | undefined;
    return row ? Number(row.v) : 0;
  }
  setIndexedSlot(slot: number) {
    const cur = this.indexedSlot();
    if (slot > cur) this.db.prepare("INSERT INTO meta(k, v) VALUES ('indexed_slot', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(String(slot));
  }

  close() {
    this.db.close();
  }
}
