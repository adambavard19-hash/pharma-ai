"use client";

import { useState, type ReactNode } from "react";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandAdvice } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { ROUTINE_CSS, RoutineIsland, RoutineThumbs, type IslandRoutine } from "@/components/island/routine-island";
import { examplePitch } from "./visuals";

/**
 * « PharmaBoost en trois étapes » (fondateur, 28 oct. 2026) : la bannière d'aujourd'hui, deux conseils, avec la routine, le
 * challenge et la date courte — d'abord la petite bannière, avant de l'ouvrir, puis ouverte —, sur un simple fond noir d'écran
 * Windows (plus le logiciel de gestion derrière). Une vente d'EXEMPLE : de vrais produits du stock local et leurs photos studio.
 */
const LIPS: IslandAdvice = {
  name: "Cicaplast Lèvres baume réparateur",
  price: "7,95 €",
  margin: "2,27 €",
  drug: "CURACNÉ 20 mg",
  challenge: true,
  stock: "IN_STOCK",
  quantity: 12,
  image: "/produits-studio/0000030106659.jpg",
  sheet: {
    ...examplePitch(
      "Cicaplast Lèvres baume réparateur",
      ["Vos lèvres sont-elles déjà sèches ou gercées ?", "Avez-vous déjà un baume à la maison ?"],
      "L'isotrétinoïne dessèche les lèvres dès les premières semaines. Ce baume les répare : à appliquer plusieurs fois par jour, pendant tout le traitement.",
      [
        { ask: 0, label: "Oui, déjà", say: "Appliquez-le dès ce soir, en couche épaisse avant de dormir." },
        { ask: 0, label: "Pas encore", say: "Commencez dès maintenant : la sécheresse arrive vite sous ce traitement." },
      ],
    ),
    reasons: ["L'isotrétinoïne dessèche fortement les lèvres dès les premières semaines."],
    description: "Appliquer sur les lèvres plusieurs fois par jour, aussi souvent que nécessaire.",
  },
};

const FLORA: IslandAdvice = {
  name: "Lactibiane Imedia",
  price: "10,80 €",
  margin: "4,42 €",
  drug: "IMODIUM 2 mg",
  shortDate: "30/11/26",
  stock: "IN_STOCK",
  quantity: 7,
  image: "/produits-studio/3401528534805.jpg",
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

const ITEMS = [LIPS, FLORA];

/** Un écran Windows noir : le fond, et la barre des tâches en bas. Pas de logiciel de gestion derrière. */
function WindowsScreen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-center text-[13px] font-bold tracking-[0.12em] text-text-tertiary uppercase">{label}</figcaption>
      <div className="relative flex min-h-[300px] flex-col overflow-hidden rounded-[22px] bg-black shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8)] ring-1 ring-black/10">
        <div className="flex flex-1 justify-center px-3 pt-4 pb-6 [&_section]:max-w-full">{children}</div>
        <div aria-hidden="true" className="flex h-11 shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-[#1A1A1A]/95">
          {["#3B82F6", "#E5E7EB", "#F59E0B", "#10B981", "#A78BFA"].map((color) => (
            <span key={color} className="size-6 rounded-md opacity-80" style={{ background: color }} />
          ))}
        </div>
      </div>
    </figure>
  );
}

export function BannerTwoStates() {
  const [routineOpen, setRoutineOpen] = useState(true);
  const thumbs = (open: boolean, onHover?: () => void) => <RoutineThumbs routine={ROUTINE} open={open} blink onToggle={() => setRoutineOpen((value) => !value)} onHover={onHover} />;
  return (
    <div data-ile-style="aurore" className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${ROUTINE_CSS}`}</style>
      <WindowsScreen label="1 · Au scan, la petite bannière">
        <div className="flex flex-col items-center">
          <MixIsland items={ITEMS} outcomes={[]} open={false} onOpen={() => undefined} onFinish={() => undefined} onAnswer={() => undefined} headAside={thumbs(false)} />
        </div>
      </WindowsScreen>
      <WindowsScreen label="2 · Ouverte : le conseil et la routine">
        <div className="flex flex-col items-center gap-2">
          <MixIsland items={ITEMS} outcomes={[]} open startAt={0} onOpen={() => undefined} onFinish={() => undefined} onAnswer={() => undefined} headAside={thumbs(routineOpen, () => setRoutineOpen(true))} />
          {routineOpen && <RoutineIsland routine={ROUTINE} width={400} cards onClose={() => setRoutineOpen(false)} />}
        </div>
      </WindowsScreen>
    </div>
  );
}
