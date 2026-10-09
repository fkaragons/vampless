import type { Metadata } from "next";
import { Suspense } from "react";
import { Demo } from "@/components/demo/demo";

export const metadata: Metadata = {
  title: "Live demo — Vampless",
  description: "Two launchpads, one registry. Run the Vampless acceptance scenario in your browser.",
};

export default function DemoPage() {
  return (
    <main className="relative">
      <div className="grid-bg absolute inset-x-0 top-0 -z-10 h-[520px]" />
      <Suspense fallback={<div className="mx-auto max-w-7xl px-5 pt-14 text-sm text-muted">Loading registry…</div>}>
        <Demo />
      </Suspense>
    </main>
  );
}
