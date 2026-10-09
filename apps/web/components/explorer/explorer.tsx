"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import type { IdentityRecord, ObservedToken } from "@vampless/core";
import { Badge, Eyebrow, type Tone } from "@/components/ui";
import { short } from "@/lib/demo-actions";
import { useRegistry } from "@/lib/registry-store";
import { DecisionView } from "@/components/demo/decision-view";
import { evaluatePolicy } from "@vampless/core";

const labelTone: Record<string, Tone> = {
  registered: "ok",
  needs_review: "warn",
  disputed: "danger",
  historical: "neutral",
  observed_conflict: "danger",
  observed: "neutral",
  unknown: "neutral",
};

const labelHelp: Record<string, string> = {
  registered: "A particular mint is bound to a registry identity under a stated policy.",
  needs_review: "Registered, but a review signal (observed collision, similar image, lookalike) is pending adjudication.",
  disputed: "A claim is under a documented challenge.",
  historical: "The record remains after an authorized migration or an upheld dispute.",
  observed_conflict: "This mint was created outside the registry and shares a protected field with a registered identity. Intent is not established.",
  observed: "Seen by the indexer; no registry conflict.",
  unknown: "Not in the registry and not yet observed. Unknown is not the same as safe — or unsafe.",
};

export function Explorer() {
  return (
    <Suspense fallback={null}>
      <ExplorerInner />
    </Suspense>
  );
}

function ExplorerInner() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const { registry, version } = useRegistry();

  const identities = registry.listIdentities();
  const observed = registry.listObserved();
  const freshness = registry.freshness();

  const query = q.trim();
  const upper = query.toUpperCase();

  // `version` is intentionally a dependency: the registry instance is stable
  // but its contents change, and the store bumps version on every mutation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resolved = useMemo(() => (query.length >= 32 ? registry.resolveMint(query) : null), [registry, query, version]);
  const matchedIdentities = useMemo(
    () => (query ? identities.filter((i) => i.display.name.includes(upper) || i.display.ticker.includes(upper) || i.mint === query || i.id.startsWith(query.toLowerCase())) : identities.slice().reverse()),
    [identities, query, upper],
  );
  const matchedObserved = useMemo(
    () => (query ? observed.filter((o) => o.name.toUpperCase().includes(upper) || o.ticker.toUpperCase().includes(upper) || o.mint === query) : observed.slice().reverse()),
    [observed, query, upper],
  );
  const selected: IdentityRecord | null = matchedIdentities.length === 1 ? matchedIdentities[0]! : resolved?.identity ?? null;

  return (
    <div className="mx-auto max-w-7xl px-5 pb-10 pt-10 md:pt-14">
      <Eyebrow>Explorer · pilot namespace</Eyebrow>
      <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight md:text-5xl">Resolve a mint. See who holds the name.</h1>
      <p className="mt-4 max-w-2xl text-muted">Status labels are deliberately distinct: registered, needs review, disputed, historical, observed conflict, unknown. “First registered” is never displayed as “verified original”.</p>

      <div className="glass mt-8 flex items-center gap-3 rounded-2xl px-4 py-3">
        <Search className="h-4 w-4 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, ticker, mint address or identity id…"
          className="mono w-full bg-transparent text-[14px] outline-none placeholder:text-muted/60"
        />
        <span className="mono hidden text-[11px] text-muted sm:block">
          {identities.length} identities · {observed.length} observed · indexed slot {freshness.indexedSlot}
        </span>
      </div>

      {resolved && (
        <div className="glass mt-6 rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mono text-[11px] uppercase tracking-wider text-muted">resolveMint</div>
              <div className="mono mt-1 break-all text-[13px]">{resolved.mint}</div>
            </div>
            <Badge tone={labelTone[resolved.label] ?? "neutral"} className="text-[12px]">
              {resolved.label.replace("_", " ")}
            </Badge>
          </div>
          <p className="mt-3 text-[13px] leading-6 text-muted">{labelHelp[resolved.label]}</p>
          {resolved.conflicts.length > 0 && (
            <div className="mt-4">
              <DecisionView decision={evaluatePolicy("observe", resolved.conflicts)} />
            </div>
          )}
          {resolved.observed && (
            <div className="mono mt-4 text-[11px] text-muted">
              observed as “{resolved.observed.name}” / {resolved.observed.ticker} via {resolved.observed.source} at slot {resolved.observed.slot}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <div className="mono mb-3 text-[10px] uppercase tracking-wider text-muted">Registered identities · {matchedIdentities.length}</div>
          <div className="space-y-2">
            {matchedIdentities.length === 0 && <Empty>No identities match. Register one in the demo.</Empty>}
            {matchedIdentities.map((i) => (
              <IdentityRow key={i.id} i={i} onSelect={() => setQ(i.mint ?? i.id)} />
            ))}
          </div>

          <div className="mono mb-3 mt-8 text-[10px] uppercase tracking-wider text-muted">Observed tokens · {matchedObserved.length}</div>
          <div className="space-y-2">
            {matchedObserved.length === 0 && <Empty>Nothing observed yet. Use “Mint outside registry” in the demo to simulate an external deployment.</Empty>}
            {matchedObserved.map((o) => (
              <ObservedRow key={o.mint} o={o} label={registry.resolveMint(o.mint).label} onSelect={() => setQ(o.mint)} />
            ))}
          </div>
        </div>

        <div>
          {selected ? <IdentityDetail i={selected} /> : <Legend />}
        </div>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-5 text-center text-[12.5px] text-muted">{children}</div>;
}

function IdentityRow({ i, onSelect }: { i: IdentityRecord; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className="glass flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition hover:border-line-strong">
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium">
          {i.display.name} <span className="mono text-muted">${i.display.ticker}</span>
        </div>
        <div className="mono mt-0.5 truncate text-[10.5px] text-muted">
          mint {short(i.mint, 5)} · {i.launchpad ?? "direct"} · {i.policy} · slot {i.registeredSlot}
        </div>
      </div>
      <Badge tone={labelTone[i.status] ?? "neutral"}>{i.status.replace("_", " ")}</Badge>
    </button>
  );
}

function ObservedRow({ o, label, onSelect }: { o: ObservedToken; label: string; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-black/20 px-4 py-3 text-left transition hover:border-line-strong">
      <div className="min-w-0">
        <div className="truncate text-[13.5px]">
          {o.name} <span className="mono text-muted">${o.ticker}</span>
        </div>
        <div className="mono mt-0.5 truncate text-[10.5px] text-muted">
          mint {short(o.mint, 5)} · {o.source} · slot {o.slot}
        </div>
      </div>
      <Badge tone={labelTone[label] ?? "neutral"}>{label.replace("_", " ")}</Badge>
    </button>
  );
}

function IdentityDetail({ i }: { i: IdentityRecord }) {
  const { registry } = useRegistry();
  const claims = registry.claimsOf(i.id);
  const disputes = registry.listDisputes(i.id);
  return (
    <div className="glass sticky top-24 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">
            {i.display.name} <span className="mono text-lg text-muted">${i.display.ticker}</span>
          </div>
          <div className="mono mt-1 break-all text-[11px] text-muted">identity {i.id}</div>
        </div>
        <Badge tone={labelTone[i.status] ?? "neutral"}>{i.status.replace("_", " ")}</Badge>
      </div>
      <p className="mt-3 text-[12.5px] leading-6 text-muted">{labelHelp[i.status]}</p>

      <dl className="mono mt-5 grid grid-cols-[110px_1fr] gap-y-2 text-[11.5px]">
        <Dt>mint</Dt>
        <Dd>{i.mint ?? "unbound"}</Dd>
        <Dt>controller</Dt>
        <Dd>{i.controller}</Dd>
        <Dt>policy</Dt>
        <Dd>{i.policy}</Dd>
        <Dt>launchpad</Dt>
        <Dd>{i.launchpad ?? "direct"}</Dd>
        <Dt>registered</Dt>
        <Dd>slot {i.registeredSlot}</Dd>
        <Dt>name key</Dt>
        <Dd>{i.keys.name}</Dd>
        <Dt>ticker key</Dt>
        <Dd>{i.keys.ticker}</Dd>
        {i.keys.rawImage && (
          <>
            <Dt>raw image</Dt>
            <Dd>{i.keys.rawImage}</Dd>
            <Dt>pixel image</Dt>
            <Dd>{i.keys.pixelImage}</Dd>
            <Dt>perceptual</Dt>
            <Dd>{i.perceptual}</Dd>
          </>
        )}
        {i.metadataUri && (
          <>
            <Dt>metadata</Dt>
            <Dd>{i.metadataUri}</Dd>
          </>
        )}
      </dl>

      <div className="mono mt-6 mb-2 text-[10px] uppercase tracking-wider text-muted">Claims · {claims.length}</div>
      <div className="space-y-1.5">
        {claims.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-black/25 px-3 py-2">
            <Badge tone="violet">{c.field}</Badge>
            <span className="mono truncate text-[10.5px] text-muted">{c.key}</span>
          </div>
        ))}
      </div>

      <div className="mono mt-6 mb-2 text-[10px] uppercase tracking-wider text-muted">History</div>
      <ol className="space-y-1.5">
        {i.history.map((h, idx) => (
          <li key={idx} className="rounded-lg border border-line bg-black/20 px-3 py-2 text-[12px]">
            <span className="mono text-muted">slot {h.slot}</span> · <span className="font-medium">{h.event.replace("_", " ")}</span>
            {h.detail && <div className="mt-0.5 text-[11.5px] leading-5 text-muted">{h.detail}</div>}
          </li>
        ))}
      </ol>
      {disputes.length > 0 && (
        <>
          <div className="mono mt-6 mb-2 text-[10px] uppercase tracking-wider text-muted">Disputes · {disputes.length}</div>
          {disputes.map((d) => (
            <div key={d.id} className="rounded-lg border border-line bg-black/20 px-3 py-2 text-[12px]">
              <Badge tone={d.status === "open" ? "warn" : d.status === "upheld" ? "danger" : "ok"}>{d.status}</Badge>
              <span className="mono ml-2 text-muted">opened slot {d.openedSlot}</span>
              {d.decision && <div className="mt-1 text-muted">{d.decision}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-muted">{children}</dt>;
}
function Dd({ children }: { children: React.ReactNode }) {
  return <dd className="break-all text-fg/85">{children}</dd>;
}

function Legend() {
  return (
    <div className="glass sticky top-24 rounded-2xl p-6">
      <div className="mono text-[10px] uppercase tracking-wider text-muted">Provenance labels</div>
      <ul className="mt-4 space-y-3">
        {Object.entries(labelHelp).map(([k, v]) => (
          <li key={k} className="flex gap-3">
            <Badge tone={labelTone[k] ?? "neutral"} className="mt-0.5 h-fit shrink-0">
              {k.replace("_", " ")}
            </Badge>
            <span className="text-[12.5px] leading-5 text-muted">{v}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[12px] leading-5 text-muted/80">
        Select an identity to see its claims, mint binding and full history. Lookups distinguish unavailable data from confirmed absence; an empty result here means “not in this pilot namespace”, nothing more.
      </p>
    </div>
  );
}
