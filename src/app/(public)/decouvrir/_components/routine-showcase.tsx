"use client";

import { useState } from "react";
import { Check, Layers } from "lucide-react";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandAdvice } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { ROUTINE_CSS, RoutineIsland, RoutineThumbs, type IslandRoutine } from "@/components/island/routine-island";

/**
 * La rubrique « La routine » de l'accueil (fondateur, 28 oct. 2026 : l'essai B, l'onglet « La routine » seul) : la vraie
 * bannière à gauche — le conseil, les photos de la routine qui clignotent, la routine qui s'ouvre au survol —, ce qu'elle fait
 * à droite. Une vente de Curacné d'EXEMPLE, de vrais produits du stock local avec leur photo studio.
 */
const ADVICE: IslandAdvice = {
  name: "Cicaplast Lèvres baume réparateur",
  price: "7,95 €",
  margin: "2,27 €",
  drug: "CURACNÉ 20 mg",
  stock: "IN_STOCK",
  quantity: 12,
  image: "/produits-studio/0000030106659.jpg",
};

const ROUTINE: IslandRoutine = {
  title: "Routine peau sous isotrétinoïne",
  drug: "CURACNÉ 20 mg",
  steps: [
    { label: "Nettoyer", name: "Cleanance gel nettoyant", price: "15,70 €", margin: "4,34 €", stock: "IN_STOCK", image: "/produits-studio/3282770207774.jpg" },
    { label: "Hydrater", name: "Effaclar H Iso-Biome", price: "16,50 €", margin: "4,44 €", stock: "IN_STOCK", image: "/produits-studio/3337875777797.jpg" },
    { label: "Boutons", name: "Effaclar Duo+M", stock: "IN_STOCK", image: "/produits-studio/3337875863377.jpg" },
    { label: "Protéger", name: "Anthelios UVMune 400", price: "17,95 €", margin: "4,44 €", stock: "IN_STOCK", image: "/produits-studio/3337875797665.jpg" },
  ],
};

const POINTS = ["Nettoyer, hydrater, traiter, protéger…", "Un produit de votre stock par étape", "Vos gammes prioritaires, étape par étape", "Le prix et la marge de l'ensemble"];

export function RoutineShowcase() {
  const [open, setOpen] = useState(true);
  return (
    <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[30px] border border-border-subtle bg-surface-card lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex items-center justify-center bg-[radial-gradient(80%_80%_at_30%_20%,var(--color-brand-50),transparent_70%)] p-6 sm:p-10 lg:border-r lg:border-border-subtle">
        <div data-ile-style="aurore" className="flex w-full max-w-[520px] flex-col items-center gap-2">
          <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${ROUTINE_CSS}`}</style>
          <MixIsland
            items={[ADVICE]}
            outcomes={[]}
            open={false}
            onOpen={() => undefined}
            onFinish={() => undefined}
            onAnswer={() => undefined}
            headAside={<RoutineThumbs routine={ROUTINE} open={open} blink onToggle={() => setOpen((value) => !value)} onHover={() => setOpen(true)} />}
          />
          {open && <RoutineIsland routine={ROUTINE} width={400} cards onClose={() => setOpen(false)} />}
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
          Quand le traitement le demande, PharmaBoost propose une routine : plusieurs produits qui vont ensemble. Les photos clignotent dans la bannière ; au survol, la routine s&apos;ouvre à côté du conseil.
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
