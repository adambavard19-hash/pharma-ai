"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarCheck, Receipt, Sparkles } from "lucide-react";
import { PUBLIC_SUGGESTIONS, safePublicHref } from "@/core/public-assistant/assistant";
import { CounterIslandScene } from "./counter-island-scene";
import type { IslandAdvice } from "./counter-island";
import { PlatformIsland } from "./platform-island";

export type PublicIslandDemo = { items: IslandAdvice[]; drug: string; alert: { title: string; text: string } | null };

const SHORTCUTS = [
  { href: "/decouvrir/demo", label: "Réserver une démo", icon: CalendarCheck, primary: true },
  { href: "/decouvrir/abonnement", label: "S'abonner", icon: Sparkles },
  { href: "/decouvrir#tarif", label: "Tarif", icon: Receipt },
];

/**
 * L'île du site public : le robot de la marque. Accueil : le comptoir en démonstration (le scénario de la bannière, en
 * boucle) et les raccourcis ; Discussion : le robot qui répond sur PharmaBoost à partir des seules pages du site.
 */
export function PublicIsland({ demo }: { demo: PublicIslandDemo }) {
  const autoOpenKey = useWelcomeOpen();
  return (
    <PlatformIsland
      label="L'île PharmaBoost"
      autoOpenKey={autoOpenKey}
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

/** Une fois par visite (onglet) : la clé de la mémoire de session. */
export const WELCOME_KEY = "pharmaboost:ile-site-accueil";
/** Le temps de laisser la page se poser avant que l'île s'ouvre. */
export const WELCOME_DELAY_MS = 700;

/**
 * Faut-il ouvrir l'île d'elle-même, à l'arrivée ? Oui, une seule fois par visite, sauf pour qui a demandé à réduire les
 * animations (la démonstration est une animation). Mémoire illisible (navigation privée stricte) : on ouvre quand même, une
 * fois par chargement.
 */
export function shouldWelcome(storage: Pick<Storage, "getItem"> | null, reducedMotion: boolean): boolean {
  if (reducedMotion) return false;
  try {
    return !storage?.getItem(WELCOME_KEY);
  } catch {
    return true; // Mémoire refusée : l'ouverture reste possible, sans souvenir.
  }
}

/** L'île s'est ouverte : retenu pour la visite (écrit à l'ouverture, pas avant : un effet rejoué ne la perd pas). */
export function rememberWelcome(storage: Pick<Storage, "setItem"> | null) {
  try {
    storage?.setItem(WELCOME_KEY, "1");
  } catch {
    // Mémoire refusée : rien à retenir.
  }
}

/**
 * À l'arrivée sur le site, l'île s'ouvre sur son Accueil et joue la démonstration du comptoir, sans attendre un clic.
 * L'ouverture ne prend jamais le focus (l'Accueil n'a pas de champ) ; un clic ailleurs ou Échap la referme.
 */
function useWelcomeOpen(): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    if (!shouldWelcome(storage, window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    const id = setTimeout(() => {
      rememberWelcome(storage);
      setKey("accueil-site");
    }, WELCOME_DELAY_MS);
    return () => clearTimeout(id);
  }, []);
  return key;
}
