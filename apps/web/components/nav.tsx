"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Github } from "lucide-react";
import { Logo } from "./logo";
import { GITHUB_URL } from "@/lib/site";

const links = [
  { href: "/", label: "Protocol" },
  { href: "/demo", label: "Live demo" },
  { href: "/explorer", label: "Explorer" },
  { href: "/spec", label: "Spec" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-5 pt-4">
        <nav className="glass flex items-center justify-between rounded-2xl px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">Vampless</span>
            <span className="mono ml-1 hidden rounded-md border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted sm:inline">
              pilot · solana
            </span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${active ? "bg-white/8 text-fg" : "text-muted hover:text-fg hover:bg-white/5"}`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:border-line-strong hover:text-fg"
            >
              <Github className="h-4 w-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <Link href="/demo" className="glow-accent rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition hover:brightness-110">
              Try it
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
