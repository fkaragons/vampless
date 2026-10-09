"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Check, Lock, ShieldAlert, X } from "lucide-react";

type Step = 0 | 1 | 2 | 3 | 4;

const STEP_MS = [1400, 1600, 1400, 2000, 1200];

export function HeroVisual() {
  const [step, setStep] = useState<Step>(0);
  useEffect(() => {
    const t = setTimeout(() => setStep(((step + 1) % 5) as Step), STEP_MS[step]);
    return () => clearTimeout(t);
  }, [step]);

  const aActive = step === 1 || step === 2;
  const bActive = step === 3 || step === 4;
  const registered = step >= 2;
  const rejected = step === 4;

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="pointer-events-none absolute -inset-10 rounded-[40px] bg-[radial-gradient(ellipse_at_center,rgba(229,36,59,0.18),transparent_60%)] blur-2xl" />
      <div className="glass relative rounded-3xl p-5 md:p-7">
        <div className="mono mb-5 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted">
          <span className="flex items-center gap-2">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-ok" /> live simulation
          </span>
          <span>namespace · solana-devnet</span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-5">
          <Launchpad name="Launchpad A" wallet="7xKp…A1" active={aActive} outcome={registered ? "ok" : null} />
          <RegistryNode registered={registered} rejected={rejected} />
          <Launchpad name="Launchpad B" wallet="Gf2q…M9" active={bActive} outcome={rejected ? "fail" : null} />
        </div>

        <div className="mt-6 h-[72px] rounded-xl border border-line bg-black/30 p-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="mono text-[12px] leading-5 text-fg/85"
            >
              {step === 0 && (
                <>
                  <span className="text-muted">$</span> registry idle — 0 claims on <span className="text-[#ff8a9a]">VAMPLESS</span> / <span className="text-[#ff8a9a]">VAMP</span>
                </>
              )}
              {step === 1 && (
                <>
                  <span className="text-muted">A ›</span> register name=<span className="text-[#ff8a9a]">Vampless</span> ticker=<span className="text-[#ff8a9a]">VAMP</span> image=sha256:9f1c…
                  <br />
                  <span className="text-muted">  </span> commitment ok · attestation ok · acquiring 4 claims…
                </>
              )}
              {step === 2 && (
                <>
                  <span className="text-ok">✓ registered</span> identity 4a2e…7c · mint bound · claims: name ticker rawImage pixelImage
                </>
              )}
              {step === 3 && (
                <>
                  <span className="text-muted">B ›</span> register name=<span className="text-[#ff8a9a]">vamp-less</span> ticker=<span className="text-[#ff8a9a]">$VAMP</span> image=sha256:0b77…
                  <br />
                  <span className="text-muted">  </span> normalized → VAMPLESS / VAMP · checking claim PDAs…
                </>
              )}
              {step === 4 && (
                <>
                  <span className="text-[#ff8a9a]">✗ rejected</span> NameClaimed, TickerClaimed — transaction failed atomically
                  <br />
                  <span className="text-muted">  </span> no partial state written · B told exactly why
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Launchpad({ name, wallet, active, outcome }: { name: string; wallet: string; active: boolean; outcome: "ok" | "fail" | null }) {
  return (
    <motion.div
      animate={{ borderColor: active ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.08)", scale: active ? 1.02 : 1 }}
      transition={{ duration: 0.3 }}
      className="relative rounded-2xl border bg-white/[0.03] p-3 md:p-4"
    >
      <div className="text-[13px] font-medium">{name}</div>
      <div className="mono mt-1 text-[11px] text-muted">{wallet}</div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-[conic-gradient(from_180deg,#ff5f73,#7c5cff,#ff5f73)]" />
        <div className="leading-tight">
          <div className="text-[12px] font-medium">Vampless</div>
          <div className="mono text-[10px] text-muted">$VAMP</div>
        </div>
      </div>
      <AnimatePresence>
        {outcome && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className={`absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full ${outcome === "ok" ? "bg-ok text-black" : "bg-accent text-white"}`}
          >
            {outcome === "ok" ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RegistryNode({ registered, rejected }: { registered: boolean; rejected: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        animate={{
          boxShadow: rejected
            ? "0 0 0 1px rgba(229,36,59,0.6), 0 0 40px -6px rgba(229,36,59,0.7)"
            : registered
              ? "0 0 0 1px rgba(52,211,153,0.5), 0 0 40px -6px rgba(52,211,153,0.5)"
              : "0 0 0 1px rgba(255,255,255,0.12), 0 0 0px 0px rgba(0,0,0,0)",
        }}
        transition={{ duration: 0.4 }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-elev md:h-20 md:w-20"
      >
        {rejected ? <ShieldAlert className="h-7 w-7 text-[#ff8a9a]" /> : <Lock className={`h-7 w-7 ${registered ? "text-ok" : "text-muted"}`} />}
      </motion.div>
      <div className="mono text-[10px] uppercase tracking-wider text-muted">registry</div>
      <div className="mono text-[10px] text-muted/70">{registered ? "4 claims" : "0 claims"}</div>
    </div>
  );
}
