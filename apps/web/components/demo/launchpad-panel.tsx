"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Dice5, ImagePlus, RefreshCw, Rocket, ScanSearch, Unplug } from "lucide-react";
import type { CheckResult, ImageDigests, PolicyId, RegisterResult } from "@vampless/core";
import { Badge, Button } from "@/components/ui";
import { fingerprintFileInBrowser } from "@/lib/decode-image";
import { bypass, fingerprintSynthetic, launch, short } from "@/lib/demo-actions";
import { getRegistry, randomAddress } from "@/lib/registry-store";
import { DecisionView } from "./decision-view";

interface Props {
  id: "launchpad-a" | "launchpad-b";
  label: string;
  wallet: string;
  onRotateWallet: () => void;
  policy: PolicyId;
  accent: "accent" | "violet";
}

type ImgState = { image: ImageDigests; preview: string; label: string } | null;

export function LaunchpadPanel({ id, label, wallet, onRotateWallet, policy, accent }: Props) {
  const [name, setName] = useState(id === "launchpad-a" ? "Vampless" : "vamp-less");
  const [ticker, setTicker] = useState(id === "launchpad-a" ? "VAMP" : "OTHER");
  const [img, setImg] = useState<ImgState>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<CheckResult | { ok: false; code: string; reason: string } | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [bypassMint, setBypassMint] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ring = accent === "accent" ? "from-accent/60 via-accent/10" : "from-violet/60 via-violet/10";

  async function onFile(f: File | undefined) {
    if (!f) return;
    setImgError(null);
    const r = await fingerprintFileInBrowser(f);
    if (!r.ok) {
      setImgError(r.reason);
      return;
    }
    setImg({ image: { raw: r.fp.raw, pixel: r.fp.pixel, perceptual: r.fp.perceptual }, preview: r.fp.previewUrl, label: `${f.name} · ${r.fp.width}×${r.fp.height}` });
  }

  function generateLogo() {
    const seed = Math.floor(Math.random() * 26);
    const g = fingerprintSynthetic(seed);
    setImg({ image: g.image, preview: g.dataUrl, label: `synthetic logo #${seed}` });
    setImgError(null);
  }

  function doPreflight() {
    const r = getRegistry().check({ name, ticker, ...(img ? { image: img.image } : {}) }, policy);
    setPreflight(r);
    setResult(null);
  }

  function doLaunch() {
    const r = launch({ name, ticker, ...(img ? { image: img.image } : {}), controller: wallet, mint: randomAddress(), policy: policy === "observe" ? "strict-any-v1" : policy, launchpad: id });
    setResult(r);
    setPreflight(null);
  }

  function doBypass() {
    const mint = bypass({ name, ticker, ...(img ? { image: img.image } : {}), source: "direct-program-call" });
    setBypassMint(mint);
    setResult(null);
    setPreflight(null);
  }

  return (
    <div className={`relative rounded-3xl bg-gradient-to-b ${ring} to-transparent p-px`}>
      <div className="glass-solid h-full rounded-[23px] p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold tracking-tight">{label}</div>
            <button onClick={onRotateWallet} className="mono mt-0.5 flex items-center gap-1.5 text-[11px] text-muted hover:text-fg" title="New wallet">
              controller {short(wallet, 4)} <RefreshCw className="h-3 w-3" />
            </button>
          </div>
          <Badge tone={accent}>integrated</Badge>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_120px] gap-3">
          <Field label="Token name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Vampless" maxLength={40} />
          </Field>
          <Field label="Ticker">
            <input value={ticker} onChange={(e) => setTicker(e.target.value)} className={`${inputCls} mono uppercase`} placeholder="$VAMP" maxLength={11} />
          </Field>
        </div>

        <Field label="Image" className="mt-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-black/30 transition hover:border-fg/40"
              title="Upload PNG / JPEG / WebP"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied blob/data URL preview; next/image can't optimize it */}
              {img ? <img src={img.preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5 text-muted" />}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-fg/85">{img ? img.label : "No image — upload or generate"}</div>
              {img && (
                <div className="mono mt-1 truncate text-[10px] text-muted">
                  raw {img.image.raw.slice(0, 10)}… · px {img.image.pixel.slice(0, 10)}… · ph {img.image.perceptual}
                </div>
              )}
              {imgError && <div className="mt-1 text-[11px] text-[#ff8a9a]">{imgError}</div>}
            </div>
            <Button variant="ghost" onClick={generateLogo} className="!px-2">
              <Dice5 className="h-4 w-4" />
            </Button>
          </div>
        </Field>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" onClick={doPreflight}>
            <ScanSearch className="h-4 w-4" /> Preflight
          </Button>
          <Button onClick={doLaunch}>
            <Rocket className="h-4 w-4" /> Launch
          </Button>
          <Button variant="ghost" onClick={doBypass} className="ml-auto" >
            <Unplug className="h-4 w-4" /> Mint outside registry
          </Button>
        </div>

        <AnimatePresence mode="wait">
          {preflight && (
            <motion.div key="pre" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 rounded-xl border border-line bg-black/25 p-4">
              <div className="mono mb-3 text-[10px] uppercase tracking-wider text-muted">preflight · reserves nothing</div>
              {preflight.ok ? (
                <>
                  <div className="mono mb-3 text-[11px] text-fg/70">
                    normalized → <span className="text-fg">{preflight.normalized.name.display}</span> (key {preflight.normalized.name.key}) · <span className="text-fg">{preflight.normalized.ticker.display}</span>
                  </div>
                  <DecisionView decision={preflight.decision} />
                </>
              ) : (
                <div className="text-[12.5px] text-[#ff8a9a]">
                  {preflight.code}: {preflight.reason}
                </div>
              )}
            </motion.div>
          )}
          {result && (
            <motion.div key="res" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`mt-5 rounded-xl border p-4 ${result.ok ? (result.identity.status === "needs_review" ? "border-warn/40 bg-warn/5" : "border-ok/40 bg-ok/5") : "border-accent/40 bg-accent/5"}`}>
              {result.ok ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-medium">{result.identity.status === "needs_review" ? "Registered — routed to review" : "Registered"}</div>
                    <Badge tone={result.identity.status === "needs_review" ? "warn" : "ok"}>{result.identity.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="mono mt-2 text-[11px] text-muted">
                    identity {short(result.identity.id, 6)} · mint {short(result.identity.mint, 4)} · slot {result.identity.registeredSlot}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {result.claims.map((c) => (
                      <span key={c.key} className="mono rounded-md border border-line bg-black/30 px-2 py-1 text-[10px]">
                        {c.field} → {c.key.slice(0, 8)}…
                      </span>
                    ))}
                  </div>
                  {result.identity.status === "needs_review" && (
                    <div className="mt-3">
                      <DecisionView decision={result.decision} compact />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-medium">Launch rejected</div>
                    <Badge tone="danger">{result.code}</Badge>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-5 text-fg/80">{result.reason}</p>
                  {result.code === "CONFLICT" && (
                    <div className="mt-3">
                      <DecisionView decision={result.decision} compact />
                    </div>
                  )}
                  <div className="mono mt-3 text-[10px] text-muted">transaction failed atomically · no claims written</div>
                </>
              )}
            </motion.div>
          )}
          {bypassMint && !result && !preflight && (
            <motion.div key="byp" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 rounded-xl border border-line bg-black/25 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-medium">Minted outside the registry</div>
                <Badge tone="neutral">observed</Badge>
              </div>
              <p className="mt-2 text-[12.5px] leading-5 text-muted">
                The token exists — Vampless cannot prevent that. The indexer picked it up as mint <span className="mono text-fg/80">{short(bypassMint, 4)}</span>. Look it up in the explorer to see how it is labeled.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-[13px] text-fg outline-none transition placeholder:text-muted/60 focus:border-line-strong";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mono mb-1.5 block text-[10px] uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}
