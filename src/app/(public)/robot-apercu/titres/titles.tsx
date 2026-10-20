"use client";

import { useEffect, useState } from "react";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandOutcome } from "@/core/island/banner-flow";
import { ITEMS } from "../styles/styles";

/** La double hélice, en filigrane : deux brins qui se croisent et leurs barreaux, répétés en frise. */
const helix = (stroke: string, rung: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='48' viewBox='0 0 120 48'><g fill='none' stroke-linecap='round'><path d='M0 24 C15 4 45 4 60 24 S105 44 120 24' stroke='${stroke}' stroke-width='2'/><path d='M0 24 C15 44 45 44 60 24 S105 4 120 24' stroke='${stroke}' stroke-width='2'/>${[10, 20, 30, 40, 50, 70, 80, 90, 100, 110].map((x) => { const t = Math.sin((x / 120) * Math.PI * 2) * 15; return `<line x1='${x}' y1='${24 - Math.abs(t)}' x2='${x}' y2='${24 + Math.abs(t)}' stroke='${rung}' stroke-width='1.4'/>`; }).join("")}</g></svg>`,
  )}")`;

const DNA_CAPSULE = helix("rgba(116,214,160,0.22)", "rgba(232,255,156,0.16)");
const DNA_CARD = helix("rgba(116,214,160,0.13)", "rgba(232,255,156,0.09)");

const TITLES = [
  { id: "aucune", label: "0 · Sans animation", hint: "Le titre fixe, pour comparer." },
  { id: "ecrit", label: "1 · Machine à écrire", hint: "Le nom s'écrit de gauche à droite à l'arrivée du conseil." },
  { id: "surligne", label: "2 · Surligneur citron", hint: "Un trait jaune citron passe sous le nom, puis s'efface." },
  { id: "lueur", label: "3 · Lueur qui passe", hint: "Un reflet de lumière traverse les lettres de temps en temps." },
  { id: "glisse", label: "4 · Arrivée floue", hint: "Le nom glisse et sort du flou, comme une mise au point." },
  { id: "souligne", label: "5 · Soulignement qui se dessine", hint: "Un trait citron se dessine sous le nom et reste." },
  { id: "rebond", label: "6 · Petit rebond", hint: "Le nom saute légèrement, pour attirer l'œil sans gêner." },
  { id: "halo", label: "7 · Halo citron", hint: "Les lettres s'illuminent d'un halo, puis reviennent au calme." },
  { id: "vague", label: "8 · Vague de couleur", hint: "Le nom passe du blanc au citron et revient, en vague." },
] as const;

/**
 * Chaque animation se joue à l'arrivée du conseil (le titre change), puis se rejoue toutes les 5 s ici pour qu'on la voie : au
 * poste, elle ne se jouerait qu'à l'arrivée d'un conseil et quand on passe au suivant — jamais en boucle pendant la lecture.
 */
const CSS = `
.adn [data-ile-style=aurore] section { background: ${DNA_CAPSULE} 0 0/120px 48px repeat, linear-gradient(180deg,#072A25 0%,#03171A 100%) !important; animation: adn-defile 18s linear infinite; }
.adn [data-ile-mix-carte] { background: ${DNA_CARD} 0 0/120px 48px repeat, #12403A !important; }
@keyframes adn-defile { from { background-position: 0 0, 0 0; } to { background-position: 120px 0, 0 0; } }
[data-ile-mix-titre] { display: inline-block; position: relative; }
.t-ecrit [data-ile-mix-titre] { animation: t-ecrit 5s steps(28, end) infinite; }
@keyframes t-ecrit { 0% { clip-path: inset(0 100% 0 0); } 30%, 100% { clip-path: inset(0 0 0 0); } }
.t-surligne [data-ile-mix-titre] { background: linear-gradient(90deg, rgba(232,255,156,.55), rgba(232,255,156,.55)) no-repeat 0 85% / 0% 40%; animation: t-surligne 5s ease-in-out infinite; }
@keyframes t-surligne { 0% { background-size: 0% 40%; } 25% { background-size: 100% 40%; } 55% { background-size: 100% 40%; opacity: 1; } 80%, 100% { background-size: 100% 0%; } }
.t-lueur [data-ile-mix-titre] { background: linear-gradient(100deg, #F2FFF9 40%, #E8FF9C 50%, #F2FFF9 60%) 0 0 / 250% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: t-lueur 5s ease-in-out infinite; }
@keyframes t-lueur { 0%, 40% { background-position: 100% 0; } 80%, 100% { background-position: 0 0; } }
.t-glisse [data-ile-mix-titre] { animation: t-glisse 5s cubic-bezier(.2,.8,.2,1) infinite; }
@keyframes t-glisse { 0% { opacity: 0; transform: translateX(-14px); filter: blur(6px); } 14%, 100% { opacity: 1; transform: none; filter: none; } }
.t-souligne [data-ile-mix-titre]::after { content: ""; position: absolute; left: 0; bottom: -3px; height: 2.5px; width: 100%; border-radius: 2px; background: #E8FF9C; transform-origin: left; animation: t-souligne 5s cubic-bezier(.6,0,.2,1) infinite; }
@keyframes t-souligne { 0% { transform: scaleX(0); } 22%, 100% { transform: scaleX(1); } }
.t-rebond [data-ile-mix-titre] { animation: t-rebond 5s cubic-bezier(.3,1.6,.5,1) infinite; }
@keyframes t-rebond { 0% { transform: translateY(0); } 5% { transform: translateY(-6px); } 10% { transform: translateY(0); } 14% { transform: translateY(-2px); } 18%, 100% { transform: none; } }
.t-halo [data-ile-mix-titre] { animation: t-halo 5s ease-in-out infinite; }
@keyframes t-halo { 0%, 100% { text-shadow: none; } 15% { text-shadow: 0 0 10px rgba(232,255,156,.9), 0 0 22px rgba(232,255,156,.55); } 40% { text-shadow: none; } }
.t-vague [data-ile-mix-titre] { animation: t-vague 5s ease-in-out infinite; }
@keyframes t-vague { 0%, 100% { color: #F2FFF9; } 20% { color: #E8FF9C; } 40% { color: #F2FFF9; } }
@media (prefers-reduced-motion: reduce) { [data-ile-mix-titre], [data-ile-mix-titre]::after, .adn section { animation: none !important; } }
`;

function Sample({ title, dna }: { title: (typeof TITLES)[number]; dna: boolean }) {
  const [outcomes, setOutcomes] = useState<(IslandOutcome | undefined)[]>([]);
  return (
    <div className={`${dna ? "adn" : ""} t-${title.id} rounded-2xl border border-[#D9E2DF] bg-[#F3F5F7] p-4`}>
      <p className="text-[14px] font-bold text-[#0F2F2A]">{title.label}</p>
      <p className="mb-3 text-[12.5px] text-[#4B6A62]">{title.hint}</p>
      <div data-ile-style="aurore" data-isl="" className="flex justify-center">
        <MixIsland items={ITEMS} outcomes={outcomes} open onOpen={() => undefined} onFinish={() => setOutcomes([])} onAnswer={(index, outcome) => setOutcomes((list) => { const next = [...list]; next[index] = outcome; return next; })} />
      </div>
    </div>
  );
}

export function TitleAnimations() {
  const [dna, setDna] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${CSS}`}</style>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[24px] font-bold text-[#0F2F2A]">Le titre du conseil, animé, sur fond ADN</h1>
        <p className="mt-1 text-[14px] text-[#4B6A62]">La bannière en ligne (carte vert foncé, texte blanc) avec une double hélice d&apos;ADN en filigrane qui défile lentement. Chaque essai anime le nom du conseil d&apos;une façon différente ; ici l&apos;animation se rejoue toutes les 5 secondes pour qu&apos;on la voie. Au poste, elle ne jouerait qu&apos;à l&apos;arrivée d&apos;un conseil et quand on passe au suivant (flèches) : jamais pendant que vous lisez.</p>
        <button type="button" onClick={() => setDna(!dna)} className="mt-3 rounded-full border border-[#0F2F2A] px-4 py-1.5 text-[13px] font-semibold text-[#0F2F2A]">
          {dna ? "Voir sans le fond ADN" : "Voir avec le fond ADN"}
        </button>
        {ready && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {TITLES.map((title) => (
              <Sample key={title.id} title={title} dna={dna} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
