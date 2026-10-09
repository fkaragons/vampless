import Link from "next/link";
import { Logo } from "./logo";
import { GITHUB_URL } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-32 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-semibold tracking-tight">Vampless</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted">
            A shared token identity registry and launch authorization protocol. A reservation made on one launchpad is honored on every other.
          </p>
          <p className="mono mt-6 text-[11px] uppercase tracking-wider text-muted/70">v0.1 · proposed design · not audited · not deployed to mainnet</p>
        </div>
        <FooterCol title="Protocol" links={[["/", "Overview"], ["/#flow", "Launch flow"], ["/#policies", "Policies"], ["/#boundary", "Boundaries"]]} />
        <FooterCol title="Build" links={[["/demo", "Live demo"], ["/explorer", "Explorer"], ["/spec", "Spec"], [GITHUB_URL, "Source"]]} />
        <FooterCol title="Docs" links={[[`${GITHUB_URL}/blob/main/docs/Vampless-Protocol-Blueprint.md`, "Blueprint"], [`${GITHUB_URL}/blob/main/docs/01-assessment-and-adoption.md`, "Adoption strategy"], [`${GITHUB_URL}/tree/main/programs/vampless-registry`, "Solana program"], [`${GITHUB_URL}/tree/main/packages/core`, "@vampless/core"]]} />
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="mono text-[11px] uppercase tracking-wider text-muted">{title}</div>
      <ul className="mt-4 space-y-2.5">
        {links.map(([href, label]) => (
          <li key={label}>
            {href.startsWith("http") ? (
              <a href={href} target="_blank" rel="noreferrer" className="text-sm text-fg/80 transition hover:text-fg">
                {label}
              </a>
            ) : (
              <Link href={href} className="text-sm text-fg/80 transition hover:text-fg">
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
