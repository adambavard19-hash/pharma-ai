"use client";

import { useEffect, useState } from "react";
import { ISLAND_CSS, IslandShell } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { MixIsland } from "@/components/island/mix-island";
import { Robot } from "@/components/robot";
import type { IslandOutcome } from "@/core/island/banner-flow";
import { ITEMS } from "../styles/styles";

const VARIANTS = [
  { id: "clair", label: "0 · Aujourd'hui (clair)", hint: "Ce que Donna voit : sur le blanc de LGPI, la bannière se perd.", bg: null, glow: "" },
  { id: "noir", label: "1 · Noir", hint: "Fond noir, ADN vert lumineux.", bg: "#07090A", glow: "hue-rotate(0deg)" },
  { id: "sapin", label: "2 · Vert sapin", hint: "Le vert foncé de PharmaBoost, ADN vert clair.", bg: "#0B2A25", glow: "hue-rotate(0deg)" },
  { id: "nuit", label: "3 · Bleu nuit", hint: "Bleu très foncé, ADN vert-bleu.", bg: "#0A1A2E", glow: "hue-rotate(-25deg)" },
  { id: "petrole", label: "4 · Bleu pétrole", hint: "Sarcelle profond, ADN turquoise.", bg: "#06302F", glow: "hue-rotate(-40deg)" },
  { id: "anthracite", label: "5 · Anthracite", hint: "Gris très foncé, ADN vert citron.", bg: "#17191A", glow: "hue-rotate(15deg) saturate(1.4)" },
  { id: "violet", label: "6 · Violet nuit", hint: "Violet très foncé, ADN vert, plus original.", bg: "#1A1230", glow: "hue-rotate(0deg)" },
] as const;

const S = "[data-ile-style=aurore] section";

function css(id: string, bg: string, glow: string) {
  const V = `.v-${id} ${S}`;
  return `
${V}:is(:has([data-ile-mix]),:has([data-ile-repos])) { background: ${bg} !important; isolation: isolate; box-shadow: 0 18px 40px -14px rgba(0,0,0,.55), 0 0 0 1px rgba(232,255,156,.18) !important; }
${V}:is(:has([data-ile-mix]),:has([data-ile-repos]))::after { content: ""; position: absolute; inset: 0; z-index: -1; display: block; pointer-events: none; background: url(/poste/adn-helice.jpg) 62% 40%/cover no-repeat; filter: invert(1) hue-rotate(180deg) ${glow} brightness(1.15) contrast(1.25) saturate(1.3); mix-blend-mode: screen; opacity: .85; }
.v-${id} [data-ile-mix] > div:first-child :not([class*=rounded], [class*=rounded] *), .v-${id} [data-ile-mix] > div:nth-child(2) > div:first-child :not([class*=rounded], [class*=rounded] *) { color: #F2FFF9 !important; -webkit-text-fill-color: #F2FFF9 !important; text-shadow: 0 1px 6px rgba(0,0,0,.7) !important; }
.v-${id} [data-ile-mix] [class*=rounded], .v-${id} [data-ile-mix] [class*=rounded] * { -webkit-text-fill-color: currentColor; }
.v-${id} [data-ile-mix] .aur-btn { color: #F2FFF9 !important; border-color: rgba(242,255,249,.45) !important; background: rgba(0,0,0,.25) !important; }
.v-${id} ${S} [data-ile-mix-carte] { background: rgba(255,255,255,.94) !important; }
.v-${id} [data-ile-repos], .v-${id} [data-ile-repos] * { color: #F2FFF9 !important; text-shadow: 0 1px 6px rgba(0,0,0,.7) !important; }
.v-${id} [data-ile-repos] .rounded-2xl { background: rgba(0,0,0,.35) !important; }
.v-${id} [data-ile-helice] { display: none; }
`;
}

/** La capsule au repos, telle que le poste la montre (« En attente de scan… »), puis ouverte. */
function Resting({ open }: { open: boolean }) {
  return (
    <IslandShell width={open ? 400 : 230} tone="neutral" contentKey={open ? "ouvert" : "repos"} label="Bannière au repos">
      {open ? (
        <div data-ile-repos="" className="px-3 pt-2.5 pb-3">
          <div className="flex items-center gap-2.5">
            <Robot size={30} mood="idle" label="Le robot PharmaBoost" />
            <div>
              <p className="text-[13.5px] font-semibold">En attente de scan…</p>
              <p className="text-[12px]">Je surveille le comptoir. Glissez-moi pour me déplacer.</p>
            </div>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            <div className="rounded-2xl px-2.5 py-2">
              <p className="text-[10.5px] font-medium tracking-[0.04em] uppercase">Comptoir</p>
              <p className="mt-0.5 text-[14px] font-semibold">● Connecté</p>
            </div>
          </div>
        </div>
      ) : (
        <div data-ile-repos="" className="flex h-10 items-center gap-2 pr-3.5 pl-1.5">
          <Robot size={28} mood="idle" label="Le robot PharmaBoost" />
          <span className="min-w-0 flex-1 truncate text-[13px]">En attente de scan…</span>
          <span className="size-2 shrink-0 rounded-full bg-[#E8FF9C]" />
        </div>
      )}
    </IslandShell>
  );
}

function Sample({ variant }: { variant: (typeof VARIANTS)[number] }) {
  const [outcomes, setOutcomes] = useState<(IslandOutcome | undefined)[]>([]);
  return (
    <section className={`v-${variant.id} border border-[#D9E2DF] bg-white p-4`} style={{ borderRadius: 16 }}>
      <p className="text-[14px] font-bold text-[#0F2F2A]">{variant.label}</p>
      <p className="mb-3 text-[12.5px] text-[#4B6A62]">{variant.hint}</p>
      {/* Un écran de logiciel de gestion, blanc et gris comme LGPI : là où la bannière doit ressortir. */}
      <div className="border border-[#C9D2D6] bg-[#F4F6F8] p-3" style={{ borderRadius: 12 }}>
        <div className="mb-2 h-6 rounded bg-[#2F4A6B]" />
        <div data-ile-style="aurore" data-isl="" className="flex flex-col items-center gap-3">
          <Resting open={false} />
          <Resting open />
          <MixIsland items={ITEMS} outcomes={outcomes} open onOpen={() => undefined} onFinish={() => setOutcomes([])} onAnswer={(index, outcome) => setOutcomes((list) => { const next = [...list]; next[index] = outcome; return next; })} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-5 rounded bg-white ring-1 ring-[#D5DCE0]" />)}</div>
      </div>
    </section>
  );
}

export function DarkDna() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${VARIANTS.filter((v) => v.bg).map((v) => css(v.id, v.bg!, v.glow)).join("\n")}`}</style>
      <div className="mx-auto max-w-7xl">
        <h1 className="text-[24px] font-bold text-[#0F2F2A]">La bannière du poste, ADN sur fond foncé</h1>
        <p className="mt-1 text-[14px] text-[#4B6A62]">Chaque essai est posé sur un écran blanc et gris comme LGPI : la capsule au repos, ouverte, puis la bannière des conseils. La carte du conseil reste blanche pour se lire facilement.</p>
        {ready && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {VARIANTS.map((variant) => (
              <Sample key={variant.id} variant={variant} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
