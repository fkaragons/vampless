/**
 * Seed the observed-token index with illustrative records so the explorer and
 * demo have something to show. These are synthetic examples, not real mints.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { b58, randomBytes, Registry } from "@vampless/core";
import { SqliteStore } from "./sqlite-store.ts";

const DB_PATH = process.env.VAMPLESS_DB ?? "./data/registry.sqlite";
mkdirSync(dirname(DB_PATH), { recursive: true });
const store = new SqliteStore(DB_PATH);
const registry = new Registry(store, { namespaceLabel: process.env.VAMPLESS_NAMESPACE ?? "solana-devnet", network: process.env.VAMPLESS_NETWORK ?? "solana-devnet" });

const samples = [
  { name: "Moon Cat", ticker: "MCAT", source: "pump.fun" },
  { name: "Moon Cat", ticker: "MOONCAT", source: "pump.fun" },
  { name: "MoonCat Official", ticker: "MCAT", source: "raydium-launchlab" },
  { name: "Solana Doge", ticker: "SDOGE", source: "pump.fun" },
  { name: "Solana Doge", ticker: "SDOGE", source: "pump.fun" },
  { name: "Solana Doge 2.0", ticker: "SDOGE", source: "manual" },
  { name: "Pepe", ticker: "PEPE", source: "pump.fun" },
  { name: "Pepe", ticker: "PEPE", source: "pump.fun" },
  { name: "Pepe", ticker: "PEPE", source: "raydium-launchlab" },
  { name: "Vampless", ticker: "VAMP", source: "manual" },
];

let slot = 1_000;
for (const s of samples) {
  slot += 37 + Math.floor(Math.random() * 400);
  registry.observe({ mint: b58.encode(randomBytes(32)), name: s.name, ticker: s.ticker, slot, source: s.source });
}
console.log(`seeded ${samples.length} observed tokens → ${DB_PATH}`);
store.close();
