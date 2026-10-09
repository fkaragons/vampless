/**
 * Normalization profile `ascii-v1`.
 *
 * The profile is deliberately restrictive so the TypeScript SDK and the Rust
 * program can validate identically. Unsupported input is rejected, never
 * silently coerced, so that an attacker cannot craft a string that passes one
 * implementation and bypasses the other.
 *
 * Two outputs are produced for every field:
 *  - `display`: the canonical human-readable form (uppercase, single spaces)
 *  - `key`:     the claim key — display with all separators removed.
 *
 * "Sol Cat", "sol-cat", "SOL.CAT" and "SolCat" therefore all map to the key
 * `SOLCAT` and contend for the same claim. That is intentional: the registry
 * exists to stop impersonation, and separators are the cheapest disguise.
 */

export const NORMALIZATION_PROFILE = "ascii-v1" as const;

export const NAME_MAX_LEN = 32;
export const TICKER_MAX_LEN = 10;

const NAME_DISPLAY_RE = /^[A-Z0-9][A-Z0-9 ._-]{0,31}$/;
const TICKER_RE = /^[A-Z0-9]{1,10}$/;

export type NormalizeOk = { ok: true; display: string; key: string };
export type NormalizeErr = {
  ok: false;
  code:
    | "EMPTY"
    | "TOO_LONG"
    | "UNSUPPORTED_CHARS"
    | "NO_ALNUM"
    | "BAD_START";
  reason: string;
};
export type NormalizeResult = NormalizeOk | NormalizeErr;

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function asciiUpper(s: string): string {
  // Only fold ASCII letters. Non-ASCII is rejected later rather than folded,
  // because case folding of arbitrary Unicode is version-dependent.
  return s.replace(/[a-z]/g, (c) => c.toUpperCase());
}

export function normalizeName(input: string): NormalizeResult {
  const collapsed = collapseWhitespace(input.normalize("NFKC"));
  if (collapsed.length === 0) return { ok: false, code: "EMPTY", reason: "name is empty" };
  if (collapsed.length > NAME_MAX_LEN)
    return { ok: false, code: "TOO_LONG", reason: `name exceeds ${NAME_MAX_LEN} characters` };
  const display = asciiUpper(collapsed);
  if (!/^[A-Z0-9]/.test(display))
    return { ok: false, code: "BAD_START", reason: "name must start with a letter or digit" };
  if (!NAME_DISPLAY_RE.test(display))
    return {
      ok: false,
      code: "UNSUPPORTED_CHARS",
      reason: "name may only contain A-Z, 0-9, space, '.', '_' and '-' (profile ascii-v1)",
    };
  const key = display.replace(/[ ._-]/g, "");
  if (key.length === 0) return { ok: false, code: "NO_ALNUM", reason: "name has no letters or digits" };
  return { ok: true, display, key };
}

export function normalizeTicker(input: string): NormalizeResult {
  let s = collapseWhitespace(input.normalize("NFKC"));
  if (s.startsWith("$")) s = s.slice(1);
  if (s.length === 0) return { ok: false, code: "EMPTY", reason: "ticker is empty" };
  if (s.length > TICKER_MAX_LEN)
    return { ok: false, code: "TOO_LONG", reason: `ticker exceeds ${TICKER_MAX_LEN} characters` };
  const display = asciiUpper(s);
  if (!TICKER_RE.test(display))
    return {
      ok: false,
      code: "UNSUPPORTED_CHARS",
      reason: "ticker may only contain A-Z and 0-9 (profile ascii-v1)",
    };
  return { ok: true, display, key: display };
}

// ---------------------------------------------------------------------------
// Confusable skeleton (review signal only — never used for claim keys)
// ---------------------------------------------------------------------------

/**
 * A small, versioned subset of UTS #39 confusables plus leetspeak digit
 * folding. The skeleton is used to raise review flags such as
 * "VАMPLESS (Cyrillic А) looks like registered VAMPLESS". It is NOT a claim
 * key and must never redefine existing claims.
 */
export const CONFUSABLE_PROFILE = "confusables-v1" as const;

const CONFUSABLE_MAP: Record<string, string> = {
  // Cyrillic → Latin
  "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P",
  "С": "C", "Т": "T", "Х": "X", "У": "Y", "а": "A", "е": "E", "о": "O", "р": "P",
  "с": "C", "х": "X", "у": "Y", "і": "I", "ј": "J", "ѕ": "S", "Ѕ": "S", "Ү": "Y",
  // Greek → Latin
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M",
  "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X", "ο": "O", "ν": "V",
  // Digits / symbols → letters
  "0": "O", "1": "I", "3": "E", "4": "A", "5": "S", "7": "T", "8": "B", "@": "A", "$": "S",
  "|": "I", "!": "I",
  // Latin lookalikes
  "L": "I", "l": "I",
};

export function confusableSkeleton(input: string): string {
  const nfkc = input.normalize("NFKC");
  let out = "";
  for (const ch of nfkc) {
    const mapped = CONFUSABLE_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const up = ch.toUpperCase();
    if (/^[A-Z0-9]$/.test(up)) out += up;
    // separators and unknown characters are dropped from the skeleton
  }
  return out;
}
