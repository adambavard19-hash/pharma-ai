"use client";

import { useState } from "react";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandOutcome } from "@/core/island/banner-flow";
import { ITEMS } from "../styles/styles";

/**
 * Les fonds à comparer : celui de la capsule ET celui de la carte où se lit le texte (fondateur, 19 oct. 2026 : « le fond où il y a
 * le texte, pas que la bande »). Le premier est la bannière en ligne. `dark` : carte sombre, texte blanc.
 */
const BACKGROUNDS = [
  { id: "actuel", label: "0 · Actuel : vert profond, carte vert très pâle", outer: "linear-gradient(180deg,#072A25 0%,#03171A 100%)", panel: "#F4F8F6", cell: "#E9F1EE", dark: false },
  { id: "blanc", label: "1 · Carte blanc pur", outer: "linear-gradient(180deg,#072A25 0%,#03171A 100%)", panel: "#FFFFFF", cell: "#F1F4F3", dark: false },
  { id: "creme", label: "2 · Carte crème", outer: "linear-gradient(180deg,#0E3B33 0%,#062019 100%)", panel: "#FFF8EC", cell: "#F6EBD6", dark: false },
  { id: "menthe", label: "3 · Carte vert menthe", outer: "linear-gradient(180deg,#0E6B55 0%,#06392E 100%)", panel: "#E3F7EE", cell: "#CDEEDF", dark: false },
  { id: "glacier", label: "4 · Carte bleu glacier, capsule bleu nuit", outer: "linear-gradient(180deg,#13254A 0%,#070F24 100%)", panel: "#EAF3FB", cell: "#D7E6F4", dark: false },
  { id: "citron", label: "5 · Carte jaune citron pâle", outer: "linear-gradient(180deg,#072A25 0%,#03171A 100%)", panel: "#FAFDE2", cell: "#EFF6C4", dark: false },
  { id: "lavande", label: "6 · Carte lavande, capsule violette", outer: "linear-gradient(180deg,#3B2266 0%,#1A0E33 100%)", panel: "#F2EEFC", cell: "#E3DAF7", dark: false },
  { id: "peche", label: "7 · Carte pêche, capsule bordeaux", outer: "linear-gradient(180deg,#5E1A2B 0%,#2A0912 100%)", panel: "#FFF0E8", cell: "#FADDCD", dark: false },
  { id: "perle", label: "8 · Carte gris perle, capsule anthracite", outer: "linear-gradient(180deg,#3A4246 0%,#1C2124 100%)", panel: "#EEF1F3", cell: "#DEE3E7", dark: false },
  { id: "sombre", label: "9 · Tout sombre : carte vert foncé, texte blanc", outer: "linear-gradient(180deg,#072A25 0%,#03171A 100%)", panel: "#12403A", cell: "#1B5249", dark: true },
  { id: "nuit", label: "10 · Tout sombre : carte noire, texte blanc", outer: "linear-gradient(180deg,#1A1D1F 0%,#050607 100%)", panel: "#23292C", cell: "#30383C", dark: true },
] as const;

const OVERRIDES = BACKGROUNDS.map((bg) =>
  [
    `.fond-${bg.id} [data-ile-style=aurore] section{background:${bg.outer}!important}`,
    `.fond-${bg.id} [data-ile-mix-carte]{background:${bg.panel}!important}`,
    `.fond-${bg.id} [data-ile-mix-carte] [role=tablist]{background:${bg.cell}!important}`,
    ...(bg.dark
      ? [
          `.fond-${bg.id} [data-ile-mix-carte], .fond-${bg.id} [data-ile-mix-carte] p, .fond-${bg.id} [data-ile-mix-carte] li, .fond-${bg.id} [data-ile-mix-carte] span:not([class*=rounded-full]){color:#F2FFF9!important}`,
          `.fond-${bg.id} [data-ile-mix-carte] [role=tab][aria-selected=true]{background:#0F2F2A!important;color:#E8FF9C!important}`,
          `.fond-${bg.id} [data-ile-mix-carte] [role=tab]{color:#BFD9D0!important}`,
        ]
      : []),
  ].join("\n"),
).join("\n");

/** Un écran de logiciel clair derrière, comme au comptoir : la bannière se lit sur fond blanc. */
function Sample({ bg }: { bg: (typeof BACKGROUNDS)[number] }) {
  const [open, setOpen] = useState(true);
  const [outcomes, setOutcomes] = useState<(IslandOutcome | undefined)[]>([]);
  return (
    <div className={`fond-${bg.id} rounded-2xl border border-[#D9E2DF] bg-[#F3F5F7] p-4`}>
      <p className="mb-3 text-[14px] font-bold text-[#0F2F2A]">{bg.label}</p>
      <div data-ile-style="aurore" data-isl="" className="flex justify-center" onPointerEnter={() => setOpen(true)}>
        <MixIsland
          items={ITEMS}
          outcomes={outcomes}
          open={open}
          onOpen={() => setOpen(!open)}
          onFinish={() => setOutcomes([])}
          onAnswer={(index, outcome) => setOutcomes((list) => { const next = [...list]; next[index] = outcome; return next; })}
        />
      </div>
    </div>
  );
}

export function BannerBackgrounds() {
  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${OVERRIDES}`}</style>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[24px] font-bold text-[#0F2F2A]">La bannière, avec différentes couleurs de fond</h1>
        <p className="mt-1 text-[14px] text-[#4B6A62]">La même vente sur chaque bannière, posée sur un écran clair comme au comptoir. Les cartes et les boutons restent les mêmes : seule la couleur du fond change. Dites le numéro qui vous plaît.</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {BACKGROUNDS.map((bg) => (
            <Sample key={bg.id} bg={bg} />
          ))}
        </div>
      </div>
    </main>
  );
}
