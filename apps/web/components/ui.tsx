"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

export function Section({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-7xl px-5 py-20 md:py-28 ${className}`}>
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mono inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </div>
  );
}

export function H2({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`mt-5 max-w-3xl text-balance text-3xl font-semibold tracking-tight md:text-5xl ${className}`}>{children}</h2>;
}

export function Lead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`mt-5 max-w-2xl text-pretty text-base leading-7 text-muted md:text-lg md:leading-8 ${className}`}>{children}</p>;
}

export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Card({ children, className = "", accent = false }: { children: ReactNode; className?: string; accent?: boolean }) {
  return (
    <div className={`glass relative overflow-hidden rounded-2xl p-6 ${accent ? "glow-accent" : ""} ${className}`}>
      {children}
    </div>
  );
}

export type Tone = "neutral" | "accent" | "ok" | "warn" | "violet" | "danger";

const tones: Record<Tone, string> = {
  neutral: "border-line bg-white/[0.04] text-fg/80",
  accent: "border-accent/40 bg-accent-soft text-[#ff8a9a]",
  danger: "border-accent/40 bg-accent-soft text-[#ff8a9a]",
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  violet: "border-violet/40 bg-violet-soft text-[#b4a3ff]",
};

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`mono inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] uppercase tracking-wider ${tones[tone]} ${className}`}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <code className="mono rounded-md border border-line bg-white/[0.04] px-1.5 py-0.5 text-[12px] text-fg/90">{children}</code>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "outline";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  const v =
    variant === "primary"
      ? "glow-accent bg-accent text-white hover:brightness-110"
      : variant === "outline"
        ? "border border-line-strong text-fg hover:bg-white/5"
        : "text-muted hover:text-fg hover:bg-white/5";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${v} ${className}`}>
      {children}
    </button>
  );
}
