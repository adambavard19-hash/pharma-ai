"use client";

import { useState } from "react";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandOutcome } from "@/core/island/banner-flow";
import { ITEMS } from "../styles/styles";

/** Les fonds à comparer : le premier est celui de la bannière en ligne. */
const BACKGROUNDS = [
  { id: "actuel", label: "0 · Vert profond (actuel)", css: "linear-gradient(180deg,#072A25 0%,#03171A 100%)" },
  { id: "noir", label: "1 · Noir", css: "linear-gradient(180deg,#1A1D1F 0%,#050607 100%)" },
  { id: "nuit", label: "2 · Bleu nuit", css: "linear-gradient(180deg,#13254A 0%,#070F24 100%)" },
  { id: "emeraude", label: "3 · Vert émeraude", css: "linear-gradient(180deg,#0E6B55 0%,#06392E 100%)" },
  { id: "violet", label: "4 · Violet", css: "linear-gradient(180deg,#3B2266 0%,#1A0E33 100%)" },
  { id: "bordeaux", label: "5 · Bordeaux", css: "linear-gradient(180deg,#5E1A2B 0%,#2A0912 100%)" },
  { id: "anthracite", label: "6 · Gris anthracite", css: "linear-gradient(180deg,#3A4246 0%,#1C2124 100%)" },
  { id: "petrole", label: "7 · Bleu pétrole", css: "linear-gradient(180deg,#0D4A5C 0%,#05222C 100%)" },
  { id: "aurore", label: "8 · Dégradé vert → bleu", css: "linear-gradient(135deg,#0B5A47 0%,#0A2E4F 100%)" },
  { id: "chocolat", label: "9 · Brun chocolat", css: "linear-gradient(180deg,#4A2E1C 0%,#1F120A 100%)" },
] as const;

const OVERRIDES = BACKGROUNDS.map((bg) => `.fond-${bg.id} [data-ile-style=aurore] section{background:${bg.css}!important}`).join("\n");

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
