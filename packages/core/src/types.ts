import type { FieldName } from "./claims.ts";

/** Hex-encoded bytes (lowercase, no 0x prefix). */
export type Hex = string;
/** Base58-encoded 32-byte public key / mint address. */
export type Address = string;

export type PolicyId = "observe" | "strict-any-v1" | "pair-v1";

export const POLICIES: Record<PolicyId, { label: string; enforced: boolean; summary: string }> = {
  observe: {
    label: "Observe",
    enforced: false,
    summary: "Never rejects. Reports every exact and likely conflict with evidence.",
  },
  "strict-any-v1": {
    label: "Strict (any field)",
    enforced: true,
    summary: "Rejects on an unauthorized match of any protected field: name, ticker, raw image or pixel image.",
  },
  "pair-v1": {
    label: "Pair",
    enforced: true,
    summary: "Rejects when both name and ticker match, or when an image matches. Name-only or ticker-only overlaps are reported, not blocked.",
  },
};

export type IdentityStatus = "registered" | "needs_review" | "disputed" | "historical";

export interface ImageDigests {
  raw: Hex; // 32 bytes
  pixel: Hex; // 32 bytes
  perceptual: Hex; // 8 bytes
}

export interface Submission {
  name: string;
  ticker: string;
  image?: ImageDigests;
  metadataUri?: string;
  metadataDigest?: Hex;
}

export interface NormalizedSubmission {
  name: { display: string; key: string };
  ticker: { display: string; key: string };
  image?: ImageDigests;
  metadataUri?: string;
  metadataDigest?: Hex;
  confusable: { name: string; ticker: string };
}

export interface ClaimRecord {
  /** hex of claimKeyHash */
  key: Hex;
  field: FieldName;
  identityId: Hex;
  /** the normalized text key or image digest hex */
  value: string;
  slot: number;
}

export interface HistoryEntry {
  slot: number;
  event:
    | "registered"
    | "review_requested"
    | "review_cleared"
    | "disputed"
    | "dispute_resolved"
    | "migrated"
    | "marked_historical";
  detail?: string;
  authority?: Address;
}

export interface IdentityRecord {
  id: Hex;
  namespace: string;
  network: string;
  policy: PolicyId;
  controller: Address;
  mint: Address | null;
  launchpad?: string;
  display: { name: string; ticker: string };
  keys: { name: string; ticker: string; rawImage?: Hex; pixelImage?: Hex };
  perceptual?: Hex;
  metadataUri?: string;
  metadataDigest?: Hex;
  registeredSlot: number;
  status: IdentityStatus;
  history: HistoryEntry[];
}

export interface ObservedToken {
  mint: Address;
  network: string;
  name: string;
  ticker: string;
  nameKey: string | null;
  tickerKey: string | null;
  rawImage?: Hex;
  pixelImage?: Hex;
  perceptual?: Hex;
  slot: number;
  /** e.g. "pump.fun", "raydium-launchlab", "manual" */
  source: string;
  program?: Address;
}

export interface DisputeRecord {
  id: Hex;
  identityId: Hex;
  openedSlot: number;
  evidenceDigest: Hex;
  claimant: Address;
  status: "open" | "upheld" | "rejected";
  resolvedSlot?: number;
  decision?: string;
  authority?: Address;
}

export type MatchField = FieldName | "perceptual" | "confusable-name" | "confusable-ticker";

export interface Match {
  field: MatchField;
  kind: "registered" | "observed";
  /** Set when kind === "registered" */
  identityId?: Hex;
  identityStatus?: IdentityStatus;
  /** Set when kind === "observed" or when the identity is bound */
  mint?: Address | null;
  source?: string;
  slot: number;
  /** Hamming distance for perceptual matches */
  distance?: number;
  detail: string;
}

export type DecisionStatus = "available" | "conflict" | "needs_review" | "indeterminate";

export interface Decision {
  status: DecisionStatus;
  policy: PolicyId;
  enforced: boolean;
  blocking: Match[];
  review: Match[];
  informational: Match[];
  reasons: string[];
}

export interface Freshness {
  /** last slot the observed index ingested */
  indexedSlot: number;
  /** total observed tokens */
  observedCount: number;
  identityCount: number;
  /** coverage interval of the observed index */
  coverage: { fromSlot: number; toSlot: number } | null;
}

export interface CheckResult {
  ok: true;
  normalized: NormalizedSubmission;
  decision: Decision;
  freshness: Freshness;
}

export interface CheckError {
  ok: false;
  code: "INVALID_NAME" | "INVALID_TICKER" | "INVALID_IMAGE";
  reason: string;
}

export type RegisterError =
  | CheckError
  | { ok: false; code: "CONFLICT"; reason: string; decision: Decision }
  | { ok: false; code: "ATTESTATION_INVALID"; reason: string }
  | { ok: false; code: "COMMITMENT_INVALID"; reason: string }
  | { ok: false; code: "MINT_ALREADY_BOUND"; reason: string; identityId: Hex }
  | { ok: false; code: "POLICY_NOT_ENFORCED"; reason: string };

export interface RegisterOk {
  ok: true;
  identity: IdentityRecord;
  decision: Decision;
  claims: ClaimRecord[];
}

export type RegisterResult = RegisterOk | RegisterError;
