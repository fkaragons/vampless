import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { confusableSkeleton, normalizeName, normalizeTicker } from "./normalize.ts";

describe("normalizeName (ascii-v1)", () => {
  it("uppercases, collapses whitespace, and strips separators for the key", () => {
    const r = normalizeName("  sol   cat ");
    assert.ok(r.ok);
    assert.equal(r.display, "SOL CAT");
    assert.equal(r.key, "SOLCAT");
  });

  it("maps separator variants to the same key", () => {
    const keys = ["Sol Cat", "sol-cat", "SOL.CAT", "SolCat", "sol_cat"].map((s) => {
      const r = normalizeName(s);
      assert.ok(r.ok, s);
      return r.key;
    });
    assert.deepEqual(new Set(keys).size, 1);
  });

  it("rejects non-ASCII rather than folding it", () => {
    const r = normalizeName("VАMPLESS"); // Cyrillic А
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "UNSUPPORTED_CHARS");
  });

  it("rejects empty, too long, and bad start", () => {
    assert.equal(normalizeName("   ").ok, false);
    assert.equal(normalizeName("a".repeat(33)).ok, false);
    assert.equal(normalizeName("-dash").ok, false);
    assert.ok(normalizeName("a".repeat(32)).ok);
  });

  it("NFKC-normalizes fullwidth letters", () => {
    const r = normalizeName("ＶＡＭＰ"); // fullwidth
    assert.ok(r.ok);
    assert.equal(r.key, "VAMP");
  });
});

describe("normalizeTicker (ascii-v1)", () => {
  it("strips a leading $ and uppercases", () => {
    const r = normalizeTicker("$vamp");
    assert.ok(r.ok);
    assert.equal(r.key, "VAMP");
  });
  it("rejects punctuation and overly long tickers", () => {
    assert.equal(normalizeTicker("VA-MP").ok, false);
    assert.equal(normalizeTicker("A".repeat(11)).ok, false);
    assert.ok(normalizeTicker("A".repeat(10)).ok);
  });
});

describe("confusableSkeleton", () => {
  it("folds Cyrillic lookalikes and leetspeak to a Latin skeleton", () => {
    // Cyrillic А and leetspeak both collapse onto the Latin skeleton (L and I fold together).
    assert.equal(confusableSkeleton("VАMPLESS"), confusableSkeleton("VAMPLESS"));
    assert.equal(confusableSkeleton("V4MPL355"), "VAMPIESS"); // 4→A, L→I, 3→E, 5→S
    assert.equal(confusableSkeleton("vampless"), "VAMPIESS");
  });
  it("is not the same as the claim key", () => {
    const n = normalizeName("Vampless");
    assert.ok(n.ok);
    assert.notEqual(confusableSkeleton("Vampless"), n.key);
  });
});
