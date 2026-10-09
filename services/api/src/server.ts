import { serve } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { b58, fromHex, publicKeyFromSecret, randomSecretKey, Registry, toHex } from "@vampless/core";
import { createApp } from "./app.ts";
import { SqliteStore } from "./sqlite-store.ts";

const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.VAMPLESS_DB ?? "./data/registry.sqlite";
const NAMESPACE = process.env.VAMPLESS_NAMESPACE ?? "solana-devnet";
const NETWORK = process.env.VAMPLESS_NETWORK ?? "solana-devnet";
const ADMIN_KEY = process.env.VAMPLESS_ADMIN_KEY;

mkdirSync(dirname(DB_PATH), { recursive: true });

const attesterSecret = process.env.VAMPLESS_ATTESTER_SECRET ? fromHex(process.env.VAMPLESS_ATTESTER_SECRET) : randomSecretKey();
const attesterPub = publicKeyFromSecret(attesterSecret);
if (!process.env.VAMPLESS_ATTESTER_SECRET) {
  console.warn(`[vampless] no VAMPLESS_ATTESTER_SECRET set; using ephemeral attester key. To persist:\n  VAMPLESS_ATTESTER_SECRET=${toHex(attesterSecret)}`);
}

const store = new SqliteStore(DB_PATH);
const registry = new Registry(store, { namespaceLabel: NAMESPACE, network: NETWORK, trustedAttesters: [attesterPub] });

// Pilot slot source: ~400ms slots since a fixed epoch. Replace with RPC getSlot.
const EPOCH = Date.UTC(2026, 0, 1);
const currentSlot = () => Math.floor((Date.now() - EPOCH) / 400);

const app = createApp({ registry, attesterSecret, currentSlot, ...(ADMIN_KEY ? { adminKey: ADMIN_KEY } : {}) });

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[vampless] api listening on http://localhost:${info.port}`);
  console.log(`[vampless] namespace=${NAMESPACE} network=${NETWORK} attester=${b58.encode(attesterPub)} db=${DB_PATH}`);
});
