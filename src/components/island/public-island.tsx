"use client";

import Link from "next/link";
import { ArrowRight, CalendarCheck, Receipt, Sparkles } from "lucide-react";
import { PUBLIC_SUGGESTIONS, safePublicHref } from "@/core/public-assistant/assistant";
import { CounterIslandScene } from "./counter-island-scene";
import type { IslandAdvice } from "./counter-island";
import { PlatformIsland } from "./platform-island";

export type PublicIslandDemo = { items: IslandAdvice[]; drug: string; alert: { title: string; text: string } | null };

const SHORTCUTS = [
  { href: "/decouvrir/demo", label: "Réserver une démo", icon: CalendarCheck, primary: true },
  { href: "/decouvrir/abonnement", label: "S'abonner", icon: Sparkles },
  { href: "/decouvrir#tarif", label: "Offre", icon: Receipt },
];

/**
 * L'île du site public : le robot de la marque. Accueil : le comptoir en démonstration (le scénario de la bannière, en
 * boucle) et les raccourcis ; Discussion : le robot qui répond sur PharmaBoost à partir des seules pages du site.
 */
export function PublicIsland({ demo }: { demo: PublicIslandDemo }) {
  return (
    <PlatformIsland
      label="L'île PharmaBoost"
      // Rien dans l'en-tête au repos : la bannière ne s'ouvre que d'un clic sur le robot du logo, sur un voile blanc,
      // jamais par-dessus le texte de la page (fondateur, 18 oct. 2026).
      dock="logo"
      backdrop
      restingText="Demandez-moi comment ça marche"
      homeLead={
        <div className="space-y-2.5">
          <p className="px-0.5 text-[11px] font-semibold tracking-[0.06em] text-white/45 uppercase">Au comptoir, en direct (exemple)</p>
          <div className="rounded-[22px] bg-white/[0.04] px-2 py-3">
            <CounterIslandScene items={demo.items} drug={demo.drug} alert={demo.alert} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SHORTCUTS.map(({ href, label, icon: Icon, primary }) => (
              <Link
                key={href}
                href={href}
                className={primary ? "inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#36E8C8] px-3.5 text-[13px] font-bold text-[#04261A]" : "inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-[13px] font-semibold text-white hover:bg-white/15"}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
                {primary && <ArrowRight className="size-3.5" aria-hidden="true" />}
              </Link>
            ))}
          </div>
        </div>
      }
      chat={{
        endpoint: "/api/public/assistant",
        suggestions: PUBLIC_SUGGESTIONS,
        safeHref: safePublicHref,
        placeholder: "Une question sur PharmaBoost ?",
        footnote: "Je réponds à partir des pages du site PharmaBoost. Je ne donne aucun conseil médical.",
      }}
    />
  );
}
