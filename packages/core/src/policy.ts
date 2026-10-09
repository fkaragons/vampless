import { POLICIES, type Decision, type Match, type PolicyId } from "./types.ts";

/**
 * Classify raw matches into blocking / review / informational under a policy.
 *
 * The policy never sees "similarity" as equality. Perceptual and confusable
 * matches are review signals in every enforced policy, and informational in
 * `observe`.
 */
export function evaluatePolicy(policy: PolicyId, matches: Match[]): Decision {
  const meta = POLICIES[policy];
  const blocking: Match[] = [];
  const review: Match[] = [];
  const informational: Match[] = [];
  const reasons: string[] = [];

  const isExactField = (m: Match) =>
    m.field === "name" || m.field === "ticker" || m.field === "rawImage" || m.field === "pixelImage";
  const isImage = (m: Match) => m.field === "rawImage" || m.field === "pixelImage";
  const isFuzzy = (m: Match) => !isExactField(m);

  if (policy === "observe") {
    for (const m of matches) informational.push(m);
    if (matches.length) reasons.push(`${matches.length} conflict signal(s) observed; policy "observe" does not enforce.`);
    return finalize();
  }

  // Shared rules for enforced policies -------------------------------------
  const registeredExact = matches.filter((m) => m.kind === "registered" && isExactField(m));
  const observedExact = matches.filter((m) => m.kind === "observed" && isExactField(m));
  const fuzzy = matches.filter(isFuzzy);

  if (policy === "strict-any-v1") {
    for (const m of registeredExact) {
      blocking.push(m);
      reasons.push(`${m.field} already claimed by identity ${short(m.identityId)} (${m.identityStatus}).`);
    }
    for (const m of observedExact) {
      review.push(m);
      reasons.push(`${m.field} observed on pre-existing mint ${short(m.mint)} (${m.source}); routed to review.`);
    }
  } else if (policy === "pair-v1") {
    const regName = registeredExact.filter((m) => m.field === "name");
    const regTicker = registeredExact.filter((m) => m.field === "ticker");
    const regImage = registeredExact.filter(isImage);

    for (const m of regImage) {
      blocking.push(m);
      reasons.push(`${m.field} already claimed by identity ${short(m.identityId)}.`);
    }
    if (regName.length && regTicker.length) {
      for (const m of [...regName, ...regTicker]) blocking.push(m);
      reasons.push("Both name and ticker are already claimed; pair policy rejects.");
    } else {
      for (const m of [...regName, ...regTicker]) {
        informational.push(m);
        reasons.push(`${m.field} overlaps a registered identity; pair policy reports but does not block.`);
      }
    }

    const obsName = observedExact.filter((m) => m.field === "name");
    const obsTicker = observedExact.filter((m) => m.field === "ticker");
    const obsImage = observedExact.filter(isImage);
    for (const m of obsImage) {
      review.push(m);
      reasons.push(`${m.field} observed on pre-existing mint ${short(m.mint)}; routed to review.`);
    }
    // Pair match against the *same* observed mint → review
    const pairMints = new Set(obsName.map((m) => m.mint).filter((x) => obsTicker.some((t) => t.mint === x)));
    for (const m of [...obsName, ...obsTicker]) {
      if (pairMints.has(m.mint)) {
        review.push(m);
      } else {
        informational.push(m);
      }
    }
    if (pairMints.size) reasons.push(`Name and ticker both observed on ${pairMints.size} pre-existing mint(s); routed to review.`);
  }

  for (const m of fuzzy) {
    review.push(m);
    reasons.push(m.detail);
  }

  return finalize();

  function finalize(): Decision {
    let status: Decision["status"] = "available";
    if (blocking.length) status = "conflict";
    else if (review.length) status = "needs_review";
    return { status, policy, enforced: meta.enforced, blocking, review, informational, reasons };
  }
}

function short(s: string | null | undefined): string {
  if (!s) return "?";
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}
