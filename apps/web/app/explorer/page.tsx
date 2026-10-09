import type { Metadata } from "next";
import { Suspense } from "react";
import { Explorer } from "@/components/explorer/explorer";

export const metadata: Metadata = {
  title: "Explorer — Vampless",
  description: "Resolve a Solana mint to its Vampless registry status: registered, needs review, disputed, historical, observed conflict or unknown.",
};

export default function ExplorerPage() {
  return (
    <main className="relative">
      <div className="grid-bg absolute inset-x-0 top-0 -z-10 h-[520px]" />
      <Suspense fallback={<div className="mx-auto max-w-7xl px-5 pt-14 text-sm text-muted">Loading registry…</div>}>
        <Explorer />
      </Suspense>
    </main>
  );
}
