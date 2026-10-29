"use client";

import type { ReactNode } from "react";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandAdvice } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { ESSAI_ENTRY } from "@/core/poste/island-fixtures";
import { readCounterSheet } from "../../../../../agent/src/counter-sheet";

/**
 * La vente d'EXEMPLE du poste, avec un conseil sans photo ni stock connu (comme Hydratis sur le poste de Donna), pour juger les
 * couleurs dans le cas le plus pâle. Chaque essai habille la VRAIE bannière en cartes par une feuille de style : rien d'autre ne
 * change (bases fortes).
 */
const ITEMS: IslandAdvice[] = ESSAI_ENTRY.items.map((item) => ({
  name: item.name,
  price: item.price || undefined,
  margin: item.margin || undefined,
  drug: item.drug || undefined,
  reason: item.reason || undefined,
  challenge: Boolean(item.challenge),
  challengeLabel: item.challenge || undefined,
  shortDate: item.shortDate || undefined,
  stock: item.availability as IslandAdvice["stock"],
  quantity: item.quantity ? Number(item.quantity) : undefined,
  image: item.image || undefined,
  sheet: readCounterSheet(item.sheet) ?? undefined,
}));
const PALE: IslandAdvice[] = [{ name: "Hydratis", drug: "VOGALIB 7", margin: "4,03 €", stock: "UNKNOWN" }, ITEMS[1]];
const noop = () => undefined;

/** Les cibles de la bannière en cartes : l'île, son fond (l'ADN), la feuille des cartes, chaque carte. */
const S = (theme: string) => ({
  shell: `.${theme} section.crd-light.crd-light`,
  frame: `.${theme} section.crd-light .isl-in > div`,
  helix: `.${theme} section.crd-light .isl-in > div > div:first-child`,
  sheet: `.${theme} [data-ile-cartes]`,
  card: `.${theme} [data-ile-cartes] [data-ile-mix-ligne]`,
  pad: `.${theme} section.crd-light .isl-in > div > div:nth-child(2)`,
});

const THEMES: { key: string; title: string; text: string; css: string }[] = [
  {
    key: "v0",
    title: "Aujourd'hui",
    text: "Ce qui est en ligne : blanc sur blanc, l'ADN très pâle. Sur l'écran de LGPI, la bannière se fond dans le décor.",
    css: "",
  },
  {
    key: "v1",
    title: "Cadre vert PharmaBoost",
    text: "Un vrai cadre vert foncé autour des cartes, avec l'ADN en clair dedans, et une ombre verte : la bannière se détache tout de suite du logiciel.",
    css: (() => {
      const s = S("v1");
      return `${s.pad}{padding:11px!important}
${s.shell}{box-shadow:0 0 0 1px #0A5C46,0 20px 44px -14px rgba(10,92,70,.65)!important}
${s.frame}{background:linear-gradient(160deg,#0E7C5A,#0A5C46)!important}
${s.helix}{opacity:.22;mix-blend-mode:screen}`;
    })(),
  },
  {
    key: "v2",
    title: "Bandeau « Conseils PharmaBoost »",
    text: "Un bandeau vert en haut avec le nom, comme une en-tête : on sait d'un coup d'œil d'où vient le conseil. Le reste reste clair.",
    css: (() => {
      const s = S("v2");
      return `${s.shell}{box-shadow:0 0 0 2px #0E7C5A,0 18px 40px -14px rgba(14,124,90,.55)!important}
${s.frame}{background:#DDF2E9!important}
${s.sheet}::before{content:"✚  Conseils PharmaBoost";display:block;margin:-6px -6px 6px;padding:7px 14px;border-radius:16px 16px 0 0;background:linear-gradient(90deg,#0E7C5A,#14A374);color:#fff;font-weight:800;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase}`;
    })(),
  },
  {
    key: "v3",
    title: "Menthe vive",
    text: "Le fond passe en menthe franche avec l'ADN bien visible ; les cartes restent blanches dessus. Plus de couleur, toujours lisible.",
    css: (() => {
      const s = S("v3");
      return `${s.pad}{padding:11px!important}
${s.shell}{box-shadow:0 0 0 1.5px #3DBF8E,0 18px 40px -14px rgba(14,124,90,.5)!important}
${s.frame}{background:linear-gradient(160deg,#BDEBD7,#8FDDBE)!important}
${s.helix}{opacity:1}
${s.sheet}{background:rgba(255,255,255,.92)!important}`;
    })(),
  },
  {
    key: "v4",
    title: "Vert et citron",
    text: "Un dégradé vert profond vers le citron de la marque autour des cartes : très « PharmaBoost », très visible, moderne.",
    css: (() => {
      const s = S("v4");
      return `${s.pad}{padding:11px!important}
${s.shell}{box-shadow:0 20px 44px -14px rgba(10,92,70,.6)!important}
${s.frame}{background:linear-gradient(135deg,#0A5C46 0%,#14A374 55%,#D9F99D 100%)!important}
${s.helix}{opacity:.25;mix-blend-mode:screen}`;
    })(),
  },
  {
    key: "v5",
    title: "Cartes colorées",
    text: "Le cadre vert, et chaque carte avec un trait de couleur à gauche et un fond teinté : on distingue mieux les conseils entre eux.",
    css: (() => {
      const s = S("v5");
      return `${s.pad}{padding:11px!important}
${s.shell}{box-shadow:0 0 0 1px #0A5C46,0 20px 44px -14px rgba(10,92,70,.6)!important}
${s.frame}{background:linear-gradient(160deg,#0E7C5A,#0A5C46)!important}
${s.helix}{opacity:.22;mix-blend-mode:screen}
${s.sheet}{background:#F4FBF8!important}
${s.card}{position:relative;margin:4px 0;background:#fff;box-shadow:0 1px 0 rgba(15,43,38,.06),0 6px 16px -10px rgba(15,43,38,.35)}
${s.card}::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:4px;border-radius:4px;background:#14A374}`;
    })(),
  },
  {
    key: "v6",
    title: "Vert nuit",
    text: "Le cadre vert nuit de la marque (comme la petite bannière d'avant), les cartes blanches dedans : le plus contrasté sur LGPI.",
    css: (() => {
      const s = S("v6");
      return `${s.pad}{padding:11px!important}
${s.shell}{box-shadow:0 0 0 1px rgba(232,255,156,.35),0 22px 46px -14px rgba(0,0,0,.6)!important}
${s.frame}{background:linear-gradient(180deg,#072A25,#03171A)!important}
${s.helix}{opacity:.35;filter:invert(1) hue-rotate(180deg) brightness(1.2)}`;
    })(),
  },
];

/** Un morceau d'écran qui imite LGPI (gris bleuté, barre de titre, tableau) : la bannière se juge sur son vrai fond. */
function FakeLgpi({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#C9D3DE] bg-[#EEF2F6]">
      <div className="flex h-9 items-center gap-3 border-b border-[#D5DDE6] bg-white px-3 text-[11px] text-[#5A6B7D]">
        <span className="font-bold text-[#2E6DA4]">LGPI</span> Facturation n° 1 sur 1 <span className="ml-auto">— ▢ ✕</span>
      </div>
      <div className="grid grid-cols-[1fr_200px] gap-2 p-3">
        <div className="h-24 rounded bg-[#B8C7DA]" />
        <div className="h-24 rounded border border-[#C9D3DE] bg-white" />
      </div>
      <div className="mx-3 mb-3 rounded border border-[#C9D3DE] bg-white text-[10.5px]">
        <div className="grid grid-cols-5 bg-[#3B5B7E] px-2 py-1 font-semibold text-white"><span>Désignation</span><span>Prest</span><span>Liste</span><span>Stock</span><span>Dus</span></div>
        <div className="grid grid-cols-5 px-2 py-1"><span>VOGALIB 7,5MG</span><span>PHN</span><span>—</span><span>44</span><span>0</span></div>
        <div className="grid grid-cols-5 bg-[#F6D77A] px-2 py-1"><span>PHLOROGLUCINOL</span><span>PHN</span><span>—</span><span>7</span><span>0</span></div>
        <div className="h-24" />
      </div>
      <div className="pointer-events-auto absolute top-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">{children}</div>
    </div>
  );
}

export function ColorTrials() {
  return (
    <main className="min-h-screen bg-[#F4F8F6] px-4 py-10">
      <style>{`${ISLAND_CSS}\n${THEMES.map((theme) => theme.css).join("\n")}`}</style>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#0F2F2A]">Les couleurs de la bannière : six essais</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#4D6B64]">
          Chaque essai habille la vraie bannière, posée sur un fond qui imite LGPI. Seules les couleurs changent : le contenu, les étapes et les règles restent les mêmes. En haut de chaque essai, le cas le plus pâle (un conseil sans photo ni stock connu, comme Hydratis chez Donna).
        </p>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {THEMES.map((theme) => (
            <article key={theme.key} className={`${theme.key} flex flex-col gap-3 rounded-2xl border bg-white p-5 ${theme.key === "v0" ? "border-[#DCE7E2]" : "border-[#DCE7E2]"}`}>
              <div>
                <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">{theme.key === "v0" ? "En ligne aujourd'hui" : `Essai ${theme.key.slice(1)}`}</p>
                <h2 className="text-[19px] font-bold text-[#0F2F2A]">{theme.title}</h2>
                <p className="mt-1 text-[13.5px] leading-6 text-[#4D6B64]">{theme.text}</p>
              </div>
              <FakeLgpi>
                <div className="flex w-[400px] max-w-full flex-col items-center gap-3 [&_section]:max-w-full">
                  <MixIsland cards items={PALE} outcomes={["SOLD"]} open={false} onOpen={noop} onFinish={noop} onAnswer={noop} />
                </div>
              </FakeLgpi>
              <div className="flex justify-center rounded-xl bg-[#EEF2F6] py-4 [&_section]:max-w-full">
                <MixIsland cards items={ITEMS} outcomes={[]} open={false} onOpen={noop} onFinish={noop} onAnswer={noop} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
