"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Play, RotateCcw, Square } from "lucide-react";
import { POLICIES, type PolicyId } from "@vampless/core";
import { Badge, Button, Eyebrow } from "@/components/ui";
import { buildScenario, type ScenarioStep } from "@/lib/demo-actions";
import { resetRegistry, rotateWallet, useRegistry } from "@/lib/registry-store";
import { LaunchpadPanel } from "./launchpad-panel";
import { RegistryPanel } from "./registry-panel";

const POLICY_ORDER: PolicyId[] = ["strict-any-v1", "pair-v1", "observe"];

export function Demo() {
  // Demo wallets live in the registry store so they hydrate with the rest of the
  // persisted state (and stay empty on the server render — no hydration mismatch).
  const { wallets } = useRegistry();
  const [policy, setPolicy] = useState<PolicyId>("strict-any-v1");
  const [steps, setSteps] = useState<Array<ScenarioStep & { result?: string }>>([]);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  async function runScenario() {
    if (running) {
      stopRef.current = true;
      return;
    }
    stopRef.current = false;
    setRunning(true);
    const s = buildScenario(policy, wallets);
    setSteps(s.map((x) => ({ ...x })));
    for (let i = 0; i < s.length; i++) {
      if (stopRef.current) break;
      await new Promise((r) => setTimeout(r, i === 0 ? 300 : 1100));
      const result = s[i]!.run() ?? "done";
      setSteps((prev) => prev.map((p, j) => (j === i ? { ...p, result: String(result) } : p)));
    }
    setRunning(false);
  }

  function reset() {
    stopRef.current = true;
    resetRegistry();
    setSteps([]);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 pb-10 pt-10 md:pt-14">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Eyebrow>Live demo · runs entirely in your browser</Eyebrow>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight md:text-5xl">Two launchpads. One registry.</h1>
          <p className="mt-4 max-w-2xl text-pretty text-muted">
            This is the real <code className="mono text-fg/80">@vampless/core</code> registry — the same code the API runs and the same encodings the Solana program verifies. Launch from either side, upload a logo, or play the scripted acceptance scenario from the blueprint.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line bg-black/30 p-1">
            {POLICY_ORDER.map((p) => (
              <button
                key={p}
                onClick={() => setPolicy(p)}
                className={`mono rounded-lg px-3 py-1.5 text-[11px] uppercase tracking-wider transition ${policy === p ? "bg-white/10 text-fg" : "text-muted hover:text-fg"}`}
                title={POLICIES[p].summary}
              >
                {POLICIES[p].label}
              </button>
            ))}
          </div>
          <Button onClick={runScenario} variant={running ? "outline" : "primary"}>
            {running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Stop" : "Run acceptance scenario"}
          </Button>
          <Button variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </div>
      </div>

      <p className="mono mt-4 text-[11px] text-muted">
        policy <span className="text-fg/80">{policy}</span> — {POLICIES[policy].summary}
        {policy === "observe" && " Launches below are registered under strict-any-v1 since observe cannot register."}
      </p>

      <AnimatePresence>
        {steps.length > 0 && (
          <motion.ol initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-6 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((s, i) => (
              <li key={i} className={`rounded-xl border p-3 text-[12px] transition ${s.result ? "border-line bg-white/[0.03]" : "border-dashed border-line/60 text-muted"}`}>
                <div className="flex items-start gap-2">
                  <span className="mono mt-0.5 text-[10px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="leading-5 text-fg/90">{s.title}</div>
                    {s.result && (
                      <div className="mt-1.5">
                        <Badge tone={s.result.startsWith("registered") ? "ok" : s.result.startsWith("needs_review") ? "warn" : s.result.startsWith("observed") ? "neutral" : "danger"}>{s.result}</Badge>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>

      <div className="mt-8 grid gap-4 xl:grid-cols-[1fr_minmax(320px,0.9fr)_1fr]">
        {wallets.a && <LaunchpadPanel id="launchpad-a" label="Launchpad A" wallet={wallets.a} onRotateWallet={() => rotateWallet("a")} policy={policy} accent="accent" />}
        <div className="order-first xl:order-none">
          <RegistryPanel />
        </div>
        {wallets.b && <LaunchpadPanel id="launchpad-b" label="Launchpad B" wallet={wallets.b} onRotateWallet={() => rotateWallet("b")} policy={policy} accent="violet" />}
      </div>

      <div className="mt-10 grid gap-4 text-[13px] leading-6 text-muted md:grid-cols-3">
        <div className="rounded-xl border border-line p-4">
          <div className="mb-1 font-medium text-fg">What is real here</div>
          Normalization, claim keys, image fingerprints, policy decisions, atomic registration and Ed25519 attestations are the production library. Only the ledger is in-memory.
        </div>
        <div className="rounded-xl border border-line p-4">
          <div className="mb-1 font-medium text-fg">What “Mint outside registry” shows</div>
          The coverage boundary. A token minted via a non-integrated path exists anyway; the indexer labels it <span className="mono text-fg/80">observed_conflict</span> instead of pretending it was prevented.
        </div>
        <div className="rounded-xl border border-line p-4">
          <div className="mb-1 font-medium text-fg">Where the state lives</div>
          In your browser&apos;s localStorage. The explorer reads the same state. Reset clears it.
        </div>
      </div>
    </div>
  );
}
