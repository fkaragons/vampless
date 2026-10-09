"use client";

/**
 * Browser-side registry: the real `@vampless/core` Registry running on an
 * in-memory store, persisted to localStorage so the demo and the explorer share
 * one state across pages and reloads. The same code path the API and (via
 * shared encodings) the on-chain program use — not a mock.
 */
import { useSyncExternalStore } from "react";
import {
  b58,
  MemoryStore,
  publicKeyFromSecret,
  randomBytes,
  Registry,
  type ClaimRecord,
  type DisputeRecord,
  type IdentityRecord,
  type ObservedToken,
} from "@vampless/core";

const LS_KEY = "vampless:registry:v1";
const ATTESTER_KEY = "vampless:attester:v1";

export const NAMESPACE_LABEL = "solana-devnet";

interface Snapshot {
  identities: IdentityRecord[];
  claims: ClaimRecord[];
  observed: ObservedToken[];
  disputes: DisputeRecord[];
  log: LogEntry[];
  slot: number;
  wallets?: DemoWallets;
}

export interface DemoWallets {
  a: string;
  b: string;
}

export interface LogEntry {
  id: string;
  at: number;
  slot: number;
  launchpad: string;
  kind: "register" | "reject" | "review" | "observe" | "migrate" | "dispute" | "resolve" | "info";
  title: string;
  detail?: string;
}

let store = new MemoryStore();
let attesterSecret: Uint8Array = randomBytes(32);
let registry = new Registry(store, { namespaceLabel: NAMESPACE_LABEL, network: "solana-devnet", trustedAttesters: [publicKeyFromSecret(attesterSecret)] });
let log: LogEntry[] = [];
let slot = 1000;
/** Empty until hydration so server and first client render agree. */
let wallets: DemoWallets = { a: "", b: "" };
let version = 0;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  version++;
  persist();
  for (const l of listeners) l();
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const snap: Snapshot = {
      identities: store.listIdentities(),
      claims: store.listIdentities().flatMap((i) => store.listClaims(i.id)),
      observed: store.listObserved(),
      disputes: store.listDisputes(),
      log: log.slice(-200),
      slot,
      wallets,
    };
    window.localStorage.setItem(LS_KEY, JSON.stringify(snap));
  } catch {
    /* quota or private mode — ignore */
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const savedKey = window.localStorage.getItem(ATTESTER_KEY);
    if (savedKey) attesterSecret = Uint8Array.from(JSON.parse(savedKey) as number[]);
    else window.localStorage.setItem(ATTESTER_KEY, JSON.stringify(Array.from(attesterSecret)));
    registry = new Registry(store, { namespaceLabel: NAMESPACE_LABEL, network: "solana-devnet", trustedAttesters: [publicKeyFromSecret(attesterSecret)] });

    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const snap = JSON.parse(raw) as Snapshot;
      store.transaction(() => {
        for (const i of snap.identities) store.putIdentity(i);
        for (const c of snap.claims) store.putClaim(c);
        for (const o of snap.observed) store.putObserved(o);
        for (const d of snap.disputes) store.putDispute(d);
      });
      log = snap.log ?? [];
      slot = snap.slot ?? slot;
      if (snap.wallets?.a && snap.wallets?.b) wallets = snap.wallets;
    }
  } catch {
    /* corrupt snapshot — start fresh */
  }
  if (!wallets.a || !wallets.b) wallets = { a: randomAddress(), b: randomAddress() };
  version++;
}

export function getDemoWallets(): DemoWallets {
  return wallets;
}

export function rotateWallet(which: keyof DemoWallets) {
  wallets = { ...wallets, [which]: randomAddress() };
  emit();
}

export function getRegistry(): Registry {
  hydrate();
  return registry;
}

export function getAttesterSecret(): Uint8Array {
  hydrate();
  return attesterSecret;
}

export function nextSlot(): number {
  slot += 1 + Math.floor(Math.random() * 3);
  return slot;
}

export function currentSlot(): number {
  return slot;
}

export function appendLog(entry: Omit<LogEntry, "id" | "at">) {
  log = [...log, { ...entry, id: Math.random().toString(36).slice(2), at: Date.now() }];
  emit();
}

export function touch() {
  emit();
}

export function resetRegistry() {
  store = new MemoryStore();
  registry = new Registry(store, { namespaceLabel: NAMESPACE_LABEL, network: "solana-devnet", trustedAttesters: [publicKeyFromSecret(attesterSecret)] });
  log = [];
  slot = 1000;
  wallets = { a: randomAddress(), b: randomAddress() };
  emit();
}

export function randomAddress(): string {
  return b58.encode(randomBytes(32));
}

/** Subscribe hook — re-renders on every registry mutation. */
export function useRegistryVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      hydrate();
      // After hydration, notify once so subscribers see persisted state.
      queueMicrotask(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => -1,
  );
}

export function useRegistry() {
  const v = useRegistryVersion();
  return { registry: getRegistry(), version: v, log, slot, wallets };
}
