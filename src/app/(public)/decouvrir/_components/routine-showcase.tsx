"use client";

import { Check, Layers } from "lucide-react";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { SCAN_CSS } from "@/components/island/scan-capsule";
import { ESSAI_ENTRY } from "@/core/poste/island-fixtures";
import { LiveCards, entryItems } from "./banner-steps";

/**
 * La rubrique « La routine » de l'accueil : la bannière d'aujourd'hui à gauche — les conseils en cartes, la routine ouverte à
 * leur place —, ce qu'elle fait à droite. La vente d'EXEMPLE du poste, de vrais produits du stock local avec leur photo studio.
 */
const ITEMS = entryItems(ESSAI_ENTRY);

const POINTS = ["Nettoyer, hydrater, traiter, protéger…", "Un produit de votre stock par étape", "Vos gammes prioritaires, étape par étape", "Le prix et la marge de l'ensemble"];

export function RoutineShowcase() {
  return (
    <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[30px] border border-border-subtle bg-surface-card lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex items-center justify-center bg-[radial-gradient(80%_80%_at_30%_20%,var(--color-brand-50),transparent_70%)] p-6 sm:p-10 lg:border-r lg:border-border-subtle">
        <div className="flex w-full max-w-[520px] flex-col items-center gap-2 [&_section]:max-w-full">
          {/* La bannière d'aujourd'hui (fondateur, 29 oct. 2026) : les cartes, la routine ouverte à la place du conseil. */}
          <style>{`${ISLAND_CSS}\n${SCAN_CSS}`}</style>
          <LiveCards items={ITEMS} initialPanel="routine" />
          <p className="text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">Exemple d&apos;écran</p>
        </div>
      </div>
      <div className="p-7 sm:p-10">
        <p className="inline-flex items-center gap-2 text-[15px] text-text-secondary">
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#E4DDFF] text-[#3B2A86]">
            <Layers className="size-3.5" aria-hidden="true" />
          </span>
          Découvrez
        </p>
        <h3 className="mt-1 text-[30px] leading-[1.05] font-bold tracking-[-0.03em] text-text-primary">Une prise en charge complète</h3>
        <p className="mt-4 text-[15.5px] leading-7 text-text-secondary">
          Quand le traitement le demande, PharmaBoost propose une routine : plusieurs produits qui vont ensemble. Elle attend sous les conseils ; un clic, et elle s&apos;ouvre à la place du conseil.
        </p>
        <ul className="mt-7 space-y-2.5">
          {POINTS.map((point) => (
            <li key={point} className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface-app px-4 py-3 text-[14.5px] font-semibold text-text-primary">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <Check className="size-3.5" aria-hidden="true" />
              </span>
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
