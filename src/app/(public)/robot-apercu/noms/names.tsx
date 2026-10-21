"use client";

import { useEffect, useRef, useState } from "react";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandOutcome } from "@/core/island/banner-flow";
import { ITEMS } from "../styles/styles";

const NAMES = [
  { id: "actuel", label: "0 · Aujourd'hui", hint: "Le trait vert qui se dessine sous le nom (à retirer)." },
  { id: "tombe", label: "1 · Tombe et rebondit", hint: "Le nom tombe d'en haut et rebondit deux fois avant de se poser." },
  { id: "pop", label: "2 · Pop élastique", hint: "Le nom surgit en grossissant, dépasse un peu, puis se cale." },
  { id: "tampon", label: "3 · Coup de tampon", hint: "Le nom s'abat comme un tampon, avec une petite secousse." },
  { id: "lettres", label: "4 · Lettres qui sautent", hint: "Chaque lettre saute à son tour, comme une vague." },
  { id: "glisse", label: "5 · Arrive de côté", hint: "Le nom glisse depuis la droite et rebondit en arrivant." },
  { id: "jelly", label: "6 · Gelée", hint: "Le nom s'écrase et s'étire comme une gelée, puis se calme." },
  { id: "pastille", label: "7 · Pastille qui éclate", hint: "Une pastille verte surgit derrière le nom en rebondissant." },
] as const;

/**
 * Chaque animation se rejoue toutes les 4 s pour qu'on la voie. Au poste, elle ne jouerait qu'à l'arrivée d'un conseil et quand
 * on passe au suivant : jamais en boucle pendant la lecture. Le trait sous le nom est retiré partout sauf sur l'essai 0.
 */
const CSS = `
[data-ile-mix-titre] { display: inline-block; position: relative; transform-origin: left bottom; }
.n-x:not(.n-actuel) [data-ile-mix-titre]::after { display: none !important; }
.n-tombe [data-ile-mix-titre] { animation: n-tombe 4s infinite; }
@keyframes n-tombe { 0% { transform: translateY(-26px); opacity: 0; animation-timing-function: cubic-bezier(.5,0,1,.6); } 8% { transform: translateY(0); opacity: 1; animation-timing-function: cubic-bezier(0,.4,.5,1); } 13% { transform: translateY(-9px); animation-timing-function: cubic-bezier(.5,0,1,.6); } 18% { transform: translateY(0); animation-timing-function: cubic-bezier(0,.4,.5,1); } 21% { transform: translateY(-3px); animation-timing-function: cubic-bezier(.5,0,1,.6); } 24%, 100% { transform: none; opacity: 1; } }
.n-pop [data-ile-mix-titre] { animation: n-pop 4s infinite; }
@keyframes n-pop { 0% { transform: scale(.3); opacity: 0; } 9% { transform: scale(1.18); opacity: 1; } 14% { transform: scale(.94); } 18% { transform: scale(1.04); } 22%, 100% { transform: none; opacity: 1; } }
.n-tampon [data-ile-mix-titre] { animation: n-tampon 4s infinite; }
@keyframes n-tampon { 0% { transform: scale(1.9) rotate(-6deg); opacity: 0; } 7% { transform: scale(.96) rotate(0); opacity: 1; } 9% { transform: translateX(-2px); } 11% { transform: translateX(2px); } 13% { transform: translateX(-1px); } 15%, 100% { transform: none; opacity: 1; } }
.n-lettres [data-ile-lettre] { display: inline-block; white-space: pre; animation: n-lettre 4s infinite; animation-delay: calc(var(--i) * 35ms); }
@keyframes n-lettre { 0% { transform: translateY(0); } 4% { transform: translateY(-8px); } 8% { transform: translateY(0); } 10% { transform: translateY(-2px); } 12%, 100% { transform: none; } }
.n-glisse [data-ile-mix-titre] { animation: n-glisse 4s infinite; }
@keyframes n-glisse { 0% { transform: translateX(60px); opacity: 0; } 9% { transform: translateX(-8px); opacity: 1; } 14% { transform: translateX(3px); } 18%, 100% { transform: none; opacity: 1; } }
.n-jelly [data-ile-mix-titre] { animation: n-jelly 4s infinite; }
@keyframes n-jelly { 0%, 30%, 100% { transform: none; } 4% { transform: scale(1.22, .78); } 9% { transform: scale(.85, 1.15); } 14% { transform: scale(1.08, .94); } 19% { transform: scale(.97, 1.03); } 24% { transform: scale(1.01, .99); } }
.n-pastille [data-ile-mix-titre] { padding: 1px 7px; margin-left: -7px; z-index: 0; }
.n-pastille [data-ile-mix-titre]::before { content: ""; position: absolute; inset: 0; z-index: -1; border-radius: 8px; background: #C9F2D9; animation: n-pastille 4s infinite; }
@keyframes n-pastille { 0% { transform: scale(0); } 9% { transform: scale(1.12); } 14% { transform: scale(.95); } 18%, 100% { transform: none; } }
@media (prefers-reduced-motion: reduce) { [data-ile-mix-titre], [data-ile-mix-titre]::before, [data-ile-lettre] { animation: none !important; } }
`;

/** Pour l'essai « lettres » : découpe le nom en lettres, chacune avec son rang (le composant réel le ferait lui-même). */
function useLetters(root: React.RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !root.current) return;
    const split = () => {
      root.current?.querySelectorAll<HTMLElement>("[data-ile-mix-titre]").forEach((title) => {
        if (title.querySelector("[data-ile-lettre]")) return;
        const text = title.textContent ?? "";
        title.setAttribute("aria-label", text);
        title.innerHTML = [...text].map((ch, i) => `<span data-ile-lettre aria-hidden="true" style="--i:${i}">${ch.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`).join("");
      });
    };
    split();
    const observer = new MutationObserver(split);
    observer.observe(root.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [root, active]);
}

function Sample({ name }: { name: (typeof NAMES)[number] }) {
  const [outcomes, setOutcomes] = useState<(IslandOutcome | undefined)[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useLetters(ref, name.id === "lettres");
  return (
    <div ref={ref} className={`n-x n-${name.id} rounded-2xl border border-[#D9E2DF] bg-[#F3F5F7] p-4`}>
      <p className="text-[14px] font-bold text-[#0F2F2A]">{name.label}</p>
      <p className="mb-3 text-[12.5px] text-[#4B6A62]">{name.hint}</p>
      <div data-ile-style="aurore" data-isl="" className="flex justify-center">
        <MixIsland items={ITEMS} outcomes={outcomes} open onOpen={() => undefined} onFinish={() => setOutcomes([])} onAnswer={(index, outcome) => setOutcomes((list) => { const next = [...list]; next[index] = outcome; return next; })} />
      </div>
    </div>
  );
}

export function NameAnimations() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${CSS}`}</style>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[24px] font-bold text-[#0F2F2A]">Le nom du produit conseil, animé</h1>
        <p className="mt-1 text-[14px] text-[#4B6A62]">La bannière d&apos;aujourd&apos;hui, sans le trait sous le nom. Ici chaque animation se rejoue toutes les 4 secondes pour qu&apos;on la voie ; au poste, elle ne jouerait qu&apos;à l&apos;arrivée du conseil et quand on passe au suivant.</p>
        {ready && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {NAMES.map((name) => (
              <Sample key={name.id} name={name} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
