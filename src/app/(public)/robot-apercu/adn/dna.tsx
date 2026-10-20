"use client";

import { useState, type ReactNode } from "react";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandOutcome } from "@/core/island/banner-flow";
import { ITEMS } from "../styles/styles";
import type { IslandAdvice } from "@/components/island/counter-island";

/**
 * L'encre ADN est celle du site (la même scène que le héros de pharmaboost.app) : elle se mélange au papier clair, elle ne se
 * voit donc que sur un fond clair. D'où les trois façons de la marier à la bannière sombre.
 */
const PAPER = `url(/poste/adn-helice.png) 62% 40% / cover no-repeat, #EFF3F1`;

const CSS = `
.adn-fond-papier { background: ${PAPER}; }
.adn-relief [data-ile-mix-carte] { position: relative; isolation: isolate; }
.adn-relief [data-ile-mix-carte]::before { content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit; background: url(/poste/adn-helice.png) 60% 45% / 160% auto no-repeat; mix-blend-mode: overlay; opacity: .55; }
.adn-relief [data-ile-mix-carte] > * { position: relative; }
.adn-papier [data-ile-style=aurore] section { background: transparent !important; box-shadow: none !important; }
.adn-papier [data-ile-style=aurore] section::before { display: none; }
.adn-clair [data-ile-mix-carte], .adn-clair [data-ile-mix-carte] p, .adn-clair [data-ile-mix-carte] li, .adn-clair [data-ile-mix-carte] span:not([class*=rounded-full]) { color: #0F2F2A !important; }
.adn-clair [data-ile-mix-carte] [role=tablist] { background: rgba(15,47,42,.08) !important; }
.adn-papier [data-ile-mix] :not([data-ile-mix-carte]):not([data-ile-mix-carte] *):not(.aur-btn):not([class*=rounded-full]) { color: #0F2F2A !important; }
.adn-papier [data-ile-mix] button[aria-label="Conseil précédent"] { background: rgba(15,47,42,.1) !important; color: #0F2F2A !important; }
.adn-papier [data-ile-mix] .aur-btn { color: #0F2F2A !important; border-color: rgba(15,47,42,.35) !important; }
.adn-clair [data-ile-mix-carte] { background: rgba(255,255,255,.42) !important; }
.adn-clair [data-ile-mix-carte] [role=tab] { color: #4D6B64 !important; }
.adn-clair [data-ile-mix-carte] [role=tab][aria-selected=true] { color: #E8FF9C !important; }
/* B amélioré : la carte devient du verre givré (l'ADN reste visible mais flouté derrière le texte), le texte du haut gagne un halo
   blanc, le soulignement passe en vert foncé (le citron disparaît sur le papier clair). */
.adn-net [data-ile-mix-carte] { background: rgba(255,255,255,.84) !important; backdrop-filter: blur(5px) saturate(1.1); -webkit-backdrop-filter: blur(5px); box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 8px 24px -14px rgba(15,47,42,.35) !important; }
.adn-net [data-ile-mix] :not([data-ile-mix-carte]):not([data-ile-mix-carte] *):not(.aur-btn):not([class*=rounded-full]) { text-shadow: 0 0 6px #fff, 0 0 2px #fff; font-weight: 700; }
.adn-net [data-ile-mix] .aur-btn { background: rgba(255,255,255,.75) !important; }
.adn-net [data-ile-mix-titre]::after { background: #1F8A5B !important; }
.adn-net [data-ile-mix-carte] p, .adn-net [data-ile-mix-carte] li { color: #0A2622 !important; }
.adn-net [data-ile-mix] [class*=rounded], .adn-net [data-ile-mix] [class*=rounded] * { text-shadow: none !important; }
.adn-cote { background: url(/poste/adn-helice.png) 108% 35% / 95% auto no-repeat, #EFF3F1; }
`;

/** Le conseil mis en avant porte une vraie photo studio (fond blanc) du dossier public/produits-studio : on voit la bannière telle qu'au comptoir. */
const ARTICHAUT = "NAT&FORM ARTICHAUT BIO 800 mg 90 gélules";
const PHOTO_ITEMS: IslandAdvice[] = ITEMS.map((item, index) => index !== 1 ? item : {
  ...item,
  name: ARTICHAUT,
  image: "/produits-studio/3535400008556.jpg",
  sheet: item.sheet && {
    ...item.sheet,
    name: ARTICHAUT,
    ask: ["Est-ce pour une digestion lourde après les repas ?"],
    answers: [
      { ask: 0, label: "Oui", say: "Je vous propose ce complément à base d'artichaut." },
      { ask: 0, label: "Non", say: "Je ne propose rien." },
    ],
    pitch: "Un complément alimentaire à base d'artichaut bio, en gélules végétales.",
  },
});

function Banner() {
  const [outcomes, setOutcomes] = useState<(IslandOutcome | undefined)[]>([]);
  return (
    <div data-ile-style="aurore" data-isl="" className="relative z-10 flex justify-center">
      <MixIsland items={PHOTO_ITEMS} outcomes={outcomes} open onOpen={() => undefined} onFinish={() => setOutcomes([])} onAnswer={(index, outcome) => setOutcomes((list) => { const next = [...list]; next[index] = outcome; return next; })} />
    </div>
  );
}

function Sample({ label, hint, className = "", children }: { label: string; hint: string; className?: string; children: ReactNode }) {
  return (
    <div className={`${className} rounded-2xl border border-[#D9E2DF] bg-white p-4`}>
      <p className="text-[14px] font-bold text-[#0F2F2A]">{label}</p>
      <p className="mb-3 text-[12.5px] text-[#4B6A62]">{hint}</p>
      {children}
    </div>
  );
}

export function DnaBanners() {
  return (
    <main className="min-h-screen bg-[#F3F5F7] px-4 py-8">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${CSS}`}</style>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[24px] font-bold text-[#0F2F2A]">La bannière avec l&apos;ADN du site</h1>
        <p className="mt-1 text-[14px] text-[#4B6A62]">L&apos;hélice d&apos;ADN de la page d&apos;accueil de pharmaboost.app, en image fixe (l&apos;hélice animée du site serait trop lourde pour un poste de comptoir). En premier, la bannière que vous avez aujourd&apos;hui, pour comparer.</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Sample label="0 · Votre bannière en ligne" hint="La B+ choisie le 20 oct. 2026 : papier ADN, carte en verre givré.">
            <div className="rounded-xl bg-[#F3F5F7] p-4">
              <Banner />
            </div>
          </Sample>
          <Sample className="adn-papier" label="A · Bande en papier ADN, carte sombre" hint="La bande devient le papier clair du site avec l'encre ADN ; la carte reste vert foncé, texte blanc.">
            <div className="flex justify-center rounded-xl bg-[#F3F5F7] p-4">
              <div className="adn-fond-papier relative isolate overflow-hidden rounded-[22px] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.35)]">
                <Banner />
              </div>
            </div>
          </Sample>
          <Sample className="adn-papier adn-clair" label="B · Tout en papier ADN, texte foncé" hint="Toute la bannière comme le site : papier clair, encre ADN visible à travers une carte voilée, texte vert foncé.">
            <div className="flex justify-center rounded-xl bg-[#F3F5F7] p-4">
              <div className="adn-fond-papier relative isolate overflow-hidden rounded-[22px] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.35)]">
                <Banner />
              </div>
            </div>
          </Sample>
          <Sample className="adn-papier adn-clair adn-net" label="B+ · Papier ADN, carte en verre givré" hint="Comme la B, mais l'ADN est flouté derrière la carte et le texte est plus foncé : il se lit d'un coup d'œil. Le nom est souligné en vert.">
            <div className="flex justify-center rounded-xl bg-[#F3F5F7] p-4">
              <div className="adn-fond-papier relative isolate overflow-hidden rounded-[22px] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.35)]">
                <Banner />
              </div>
            </div>
          </Sample>
          <Sample className="adn-papier adn-clair adn-net" label="B++ · Comme B+, l'hélice sur le côté" hint="L'hélice passe sur le bord droit : elle ne croise plus le texte du haut, la carte reste givrée.">
            <div className="flex justify-center rounded-xl bg-[#F3F5F7] p-4">
              <div className="adn-cote relative isolate overflow-hidden rounded-[22px] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.35)]">
                <Banner />
              </div>
            </div>
          </Sample>
          <Sample className="adn-relief" label="C · Bannière sombre, ADN en relief dans la carte" hint="La bannière actuelle, avec l'hélice du site en filigrane dans la carte vert foncé.">
            <div className="rounded-xl bg-[#F3F5F7] p-4">
              <Banner />
            </div>
          </Sample>
        </div>
      </div>
    </main>
  );
}
