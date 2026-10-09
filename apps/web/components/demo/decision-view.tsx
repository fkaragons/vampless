"use client";

import type { Decision, Match } from "@vampless/core";
import { Badge, type Tone } from "@/components/ui";
import { short } from "@/lib/demo-actions";

const statusTone: Record<Decision["status"], Tone> = { available: "ok", conflict: "danger", needs_review: "warn", indeterminate: "neutral" };

export function DecisionView({ decision, compact = false }: { decision: Decision; compact?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone[decision.status]}>{decision.status.replace("_", " ")}</Badge>
        <Badge tone={decision.enforced ? "violet" : "neutral"}>{decision.policy}</Badge>
        {!decision.enforced && <span className="text-[12px] text-muted">advisory — nothing is blocked</span>}
      </div>
      {decision.reasons.length > 0 && !compact && (
        <ul className="space-y-1 text-[12.5px] leading-5 text-fg/80">
          {decision.reasons.slice(0, 6).map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted">›</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
      <MatchGroup label="Blocking" tone="danger" items={decision.blocking} />
      <MatchGroup label="Review" tone="warn" items={decision.review} />
      <MatchGroup label="Informational" tone="neutral" items={decision.informational} />
    </div>
  );
}

function MatchGroup({ label, tone, items }: { label: string; tone: Tone; items: Match[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mono mb-1.5 text-[10px] uppercase tracking-wider text-muted">
        {label} · {items.length}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((m, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-black/30 px-2 py-1 text-[11px]">
            <Badge tone={tone} className="!px-1.5 !py-0">
              {m.field}
            </Badge>
            <span className="text-muted">{m.kind}</span>
            <span className="mono text-fg/70">{m.identityId ? short(m.identityId, 4) : short(m.mint, 4)}</span>
            {m.distance !== undefined && <span className="mono text-muted">d={m.distance}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
