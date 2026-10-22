"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ScanLine, Store, Tag, User } from "lucide-react";
import { ACCENT } from "./ui";

const TABS = [
  { href: "/app", label: "Accueil", Icon: Home, match: (p: string) => p === "/app" },
  { href: "/app/scanner", label: "Scanner", Icon: ScanLine, match: (p: string) => p.startsWith("/app/scanner") || p.startsWith("/app/fiche") || p.startsWith("/app/recherche") },
  { href: "/app/offres", label: "Offres", Icon: Tag, match: (p: string) => p.startsWith("/app/offres") || p.startsWith("/app/abonnement") },
  { href: "/app/pharmacies", label: "Pharmacies", Icon: Store, match: (p: string) => p.startsWith("/app/pharmacies") },
  { href: "/app/ma-pharmacie", label: "Mon espace", Icon: User, match: (p: string) => p.startsWith("/app/ma-pharmacie") || p.startsWith("/app/connexion") || p.startsWith("/app/armoire") },
];

/** Les cinq onglets du bas, au-dessus de la zone sûre de l'iPhone. */
export function PatientTabs() {
  const path = usePathname() ?? "/app";
  return (
    <nav aria-label="Navigation" className="m-safe-bottom fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[440px] border-t border-[#E3ECE9] bg-white/95 px-3 pt-2 backdrop-blur">
      {TABS.map(({ href, label, Icon, match }) => {
        const active = match(path);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className="flex flex-1 flex-col items-center gap-0.5 pb-2 text-[11px] font-semibold" style={{ color: active ? ACCENT : "#94A3A0" }}>
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
