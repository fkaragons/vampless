"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Lock } from "lucide-react";
import type { IdentityRecord } from "@vampless/core";
import { Badge, type Tone } from "@/components/ui";
import { short } from "@/lib/demo-actions";
import { useRegistry } from "@/lib/registry-store";

const statusTone: Record<IdentityRecord["status"], Tone> = { registered: "ok", needs_review: "warn", disputed: "danger", historical: "neutral" };
const kindTone: Record<string, Tone> = { register: "ok", reject: "danger", review: "warn", observe: "neutral", migrate: "violet", dispute: "danger", resolve: "violet", info: "neutral" };

export function RegistryPanel() {
  const { registry, log, slot } = useRegistry();
  const identities = registry.listIdentities().slice().reverse();
  const observed = registry.listObserved();
  const claims = identities.reduce((n, i) => n + registry.claimsOf(i.id).length, 0);

  return (
    <div className="glass flex h-full flex-col rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/40 ring-1 ring-line">
            <Lock className="h-4 w-4 text-fg/80" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Shared registry</div>
            <div className="mono text-[11px] text-muted">solana-devnet · ns {registry.namespaceHex.slice(0, 8)}…</div>
          </div>
        </div>
        <div className="mono text-right text-[11px] text-muted">
          slot {slot}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat n={identities.length} label="identities" />
        <Stat n={claims} label="claims" />
        <Stat n={observed.length} label="observed" />
      </div>

      <div className="mono mt-5 mb-2 text-[10px] uppercase tracking-wider text-muted">Identities</div>
      <div className="max-h-56 space-y-1.5 overflow-auto pr-1">
        <AnimatePresence initial={false}>
          {identities.length === 0 && <div className="rounded-lg border border-dashed border-line p-4 text-center text-[12px] text-muted">No identities yet. Launch something.</div>}
          {identities.map((i) => (
            <motion.div key={i.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-black/25 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-medium">
                  {i.display.name} <span className="mono text-muted">${i.display.ticker}</span>
                </div>
                <div className="mono truncate text-[10px] text-muted">
                  {i.launchpad ?? "—"} · mint {short(i.mint, 4)} · slot {i.registeredSlot}
                </div>
              </div>
              <Link href={`/explorer?q=${i.mint ?? i.id}`} className="shrink-0">
                <Badge tone={statusTone[i.status]}>{i.status.replace("_", " ")}</Badge>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mono mt-5 mb-2 text-[10px] uppercase tracking-wider text-muted">Event log</div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
        <AnimatePresence initial={false}>
          {log
            .slice()
            .reverse()
            .slice(0, 40)
            .map((e) => (
              <motion.div key={e.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-line bg-black/20 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge tone={kindTone[e.kind] ?? "neutral"} className="!px-1.5 !py-0">
                    {e.kind}
                  </Badge>
                  <span className="mono text-[10px] text-muted">
                    {e.launchpad} · slot {e.slot}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-fg/90">{e.title}</div>
                {e.detail && <div className="mt-0.5 text-[11px] leading-4 text-muted">{e.detail}</div>}
              </motion.div>
            ))}
        </AnimatePresence>
        {log.length === 0 && <div className="text-[12px] text-muted">Events will appear here.</div>}
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-lg border border-line bg-black/25 px-3 py-2">
      <div className="text-xl font-semibold tracking-tight">{n}</div>
      <div className="mono text-[10px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}
