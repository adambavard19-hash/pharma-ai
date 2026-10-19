"use client";

import type { CSSProperties } from "react";
import { CounterIsland, type IslandAdvice } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { INITIAL_ISLAND } from "@/core/island/banner-flow";

/** Une vente de deux boîtes, comme sur la vidéo du POSTE de Docteur Nicolas (19 oct. 2026). Chiffres d'exemple. */
const PHLORO = "PHLOROGLUCINOL VIATRIS 80 mg";
const GAVISCON = "GAVISCONELL MENTHE SANS SUCRE";
const sheet = (name: string) => ({ name, reasons: [], script: "", contraindications: [], usage: [], description: "", more: { contraindications: 0, usage: 0 }, cut: false });
const ITEMS: IslandAdvice[] = [
  { name: "MACROGOL 4000 ARROW 4 g", drug: PHLORO, price: "5,20 €", margin: "1,85 €", stock: "IN_STOCK", quantity: 14 },
  {
    name: "NEOBIANACID CITRON CPR 70",
    drug: GAVISCON,
    price: "15,50 €",
    margin: "4,79 €",
    stock: "IN_STOCK",
    quantity: 8,
    challenge: true,
    pitchOpen: true,
    sheet: {
      ...sheet("NEOBIANACID CITRON CPR 70"),
      ask: ["Les brûlures reviennent-elles surtout après les repas ou la nuit ?", "Avez-vous du mal à avaler, ou maigrissez-vous sans raison ?"],
      answers: [
        { ask: 0, label: "Après les repas", say: "À prendre juste après le repas, dès les premières brûlures." },
        { ask: 0, label: "Surtout la nuit", say: "Au coucher, et surélevez la tête du lit.", product: { name: "NEOBIANACID Cpr suc B/45 MENTHE", price: "15,50 €", margin: "4,79 €", stock: "IN_STOCK", quantity: 8 } },
        { ask: 1, label: "Non", say: "Je vous propose ce produit." },
        { ask: 1, label: "Oui", say: "Je ne propose rien : parlez-en au médecin sans attendre." },
      ],
      pitch: "Ces comprimés forment un film protecteur qui calme les brûlures en complément de votre traitement. Un comprimé à croquer après le repas ou au coucher.",
    },
  },
  { name: "NEOBIANACID Cpr suc B/45 MENTHE", drug: GAVISCON, price: "15,50 €", margin: "4,79 €", stock: "LOW_STOCK", quantity: 3 },
];
const BOXES = [
  { id: "b1", name: PHLORO },
  { id: "b2", name: GAVISCON },
];

type Variant = { id: string; name: string; font: string; note: string; vars: Record<string, string>; css?: string; zoom?: number };

const VARIANTS: Variant[] = [
  {
    id: "A",
    name: "Ancienne",
    font: "Plus Jakarta Sans",
    note: "La bannière d'avant le 19 oct. 2026, pour comparer.",
    vars: { bg: "#0B0F14", accent: "#22C88F", glow: "#36E8C8", panel: "#F5FAFC", ink: "#10222F", inkSoft: "#5A7280", line: "#DCE8EE", cell: "#F1F5F7", pick: "#0B6B57", pickLine: "#C9D5DC", number: "rgba(54,232,200,0.18)", numberFg: "#0B6B57", then: "rgba(54,232,200,0.10)", soldBg: "#22C88F", soldFg: "#FFFFFF", challengeBg: "#FFF0C7", challengeFg: "#8A5A00" },
    css: ".font-bold{font-weight:700}",
  },
  {
    id: "B",
    name: "Ardoise & menthe",
    font: "Inter",
    note: "Noir ardoise, vert menthe vif, texte plus gras et plus net.",
    vars: { bg: "#15181D", accent: "#3DDC97", glow: "#3DDC97", panel: "#FFFFFF", ink: "#0B1220", inkSoft: "#5B6675", line: "#E4E8EE", cell: "#F3F5F8", pick: "#0E9F6E", pickLine: "#CBD3DC", number: "rgba(61,220,151,0.18)", numberFg: "#0E7A55", then: "rgba(61,220,151,0.12)", soldBg: "#3DDC97", soldFg: "#06281A" },
    css: ".font-bold{font-weight:800}.font-semibold{font-weight:600}",
  },
  {
    id: "C",
    name: "Vert PharmaBoost (en ligne)",
    font: "Plus Jakarta Sans",
    note: "Les couleurs du site et d'Instagram : vert profond et jaune citron.",
    vars: { bg: "#0F2F2A", accent: "#E8FF9C", glow: "#E8FF9C", panel: "#F4F8F6", ink: "#0F2F2A", inkSoft: "#4D6B64", line: "#DCE7E2", cell: "#E9F1EE", pick: "#247061", pickLine: "#B9CFC6", number: "rgba(36,112,97,0.14)", numberFg: "#247061", then: "rgba(232,255,156,0.55)", soldBg: "#247061", soldFg: "#FFFFFF", challengeBg: "#E8FF9C", challengeFg: "#3D4F00" },
    css: ".font-bold{font-weight:800}",
  },
  {
    id: "D",
    name: "Bleu nuit",
    font: "Manrope",
    note: "Bleu nuit élégant, accents bleus, police ronde et moderne.",
    vars: { bg: "#0B1B33", accent: "#4ADE80", glow: "#60A5FA", panel: "#F7FAFF", ink: "#0B1B33", inkSoft: "#5A6B85", line: "#DFE7F3", cell: "#EEF3FB", pick: "#1D4ED8", pickLine: "#C3D1EA", number: "rgba(59,130,246,0.15)", numberFg: "#1D4ED8", then: "rgba(59,130,246,0.10)" },
    css: ".font-bold{font-weight:800}",
  },
  {
    id: "E",
    name: "Croix verte",
    font: "DM Sans",
    note: "Le vert de la croix de pharmacie, très « officine », police douce.",
    vars: { bg: "#06281A", accent: "#2BD576", glow: "#2BD576", panel: "#FFFFFF", ink: "#0A1F14", inkSoft: "#557063", line: "#E1ECE6", cell: "#F0F7F3", pick: "#12924F", pickLine: "#C5D9CE", number: "rgba(43,213,118,0.18)", numberFg: "#12924F", then: "rgba(43,213,118,0.12)", soldBg: "#2BD576", soldFg: "#06281A" },
    css: ".font-bold{font-weight:700}",
  },
  {
    id: "F",
    name: "Grand contraste",
    font: "Atkinson Hyperlegible",
    note: "Noir et blanc francs, police faite pour la lisibilité, un peu plus grande.",
    vars: { bg: "#000000", accent: "#00E08A", glow: "#00E08A", panel: "#FFFFFF", ink: "#000000", inkSoft: "#3D4752", line: "#D9DEE3", cell: "#F2F4F6", pick: "#000000", pickLine: "#9AA4AE", number: "#000000", numberFg: "#FFFFFF", then: "#FFF4B8" },
    css: ".font-bold{font-weight:700}",
    zoom: 1.1,
  },
];

const FONTS_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Manrope:wght@400;600;700;800&family=DM+Sans:wght@400;600;700&family=Atkinson+Hyperlegible:wght@400;700&display=swap";
const noop = () => {};

export function BannerStyles() {
  return (
    <main className="min-h-dvh bg-[#E9EDF1] px-4 py-6 text-ink-900 sm:px-6">
      <link rel="stylesheet" href={FONTS_URL} />
      <style>{ISLAND_CSS}</style>
      <style>{VARIANTS.map((v) => (v.css ? v.css.replace(/(^|\})\s*([^{}]+)\{/g, (_m, close, selector) => `${close}[data-essai="${v.id}"] ${selector}{`) : "")).join("\n")}</style>
      <div className="mx-auto max-w-[1500px]">
        <p className="font-mono text-[11.5px] tracking-[0.14em] text-brand-700 uppercase">Aperçu de développement</p>
        <h1 className="mt-1 text-[26px] leading-tight font-bold tracking-[-0.02em]">Essais de la bannière</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-text-secondary">
          La même vente de deux boîtes, menu du NEOBIANACID ouvert. Touchez les réponses du patient pour voir la suite. Dites-moi la lettre que vous préférez — ou mélangez : « les couleurs de C avec la police de B ».
        </p>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {VARIANTS.map((v) => (
            <section key={v.id} className="rounded-2xl border border-border-subtle bg-white p-4 shadow-sm">
              <header className="flex items-baseline gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[17px] font-bold text-white">{v.id}</span>
                <div>
                  <h2 className="text-[17px] font-bold text-text-primary">{v.name}</h2>
                  <p className="text-[13px] text-text-secondary">
                    Police <b>{v.font}</b> · {v.note}
                  </p>
                </div>
              </header>
              <div
                data-essai={v.id}
                className="mt-3 flex min-h-[720px] justify-center rounded-xl bg-[#DDE3E8] pt-4"
                style={{ fontFamily: `"${v.font}", system-ui, sans-serif`, ...Object.fromEntries(Object.entries(v.vars).map(([key, value]) => [`--isl-${key}`, value])) } as CSSProperties}
              >
                <div style={{ zoom: v.zoom }}>
                  <CounterIsland
                    state={{ ...INITIAL_ISLAND, stage: "advice", outcomes: [null, null, null] }}
                    items={ITEMS}
                    drug={GAVISCON}
                    alert={null}
                    pills={[]}
                    boxes={BOXES}
                    compactAdvice
                    keepAwake
                    autoOutcome
                    onAnswer={noop}
                    onEmail={noop}
                    onSendEmail={noop}
                    onAddEmail={noop}
                    onFinish={noop}
                    onDismissAlert={noop}
                    finishLabel="Terminer la vente"
                  />
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
