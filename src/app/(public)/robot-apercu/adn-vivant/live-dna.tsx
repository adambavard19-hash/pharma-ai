"use client";

import { useEffect, useState } from "react";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { MixIsland } from "@/components/island/mix-island";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import type { IslandOutcome } from "@/core/island/banner-flow";
import { ITEMS } from "../styles/styles";

const VARIANTS = [
  { id: "fixe", label: "0 · Aujourd'hui", hint: "L'image fixe de l'hélice, pour comparer." },
  { id: "vivant", label: "1 · L'hélice vivante du site", hint: "La même hélice qu'en haut de pharmaboost.app : elle tourne, lâche son encre et se déforme sous la souris." },
  { id: "respire", label: "2 · L'image qui respire", hint: "L'image d'aujourd'hui glisse et zoome très lentement : le plus léger pour un poste." },
  { id: "defile", label: "3 · L'hélice qui défile", hint: "Une double hélice dessinée qui défile doucement derrière la carte." },
] as const;

/** Une double hélice en filigrane, répétée en frise (essai 3). */
const HELIX = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='64' viewBox='0 0 160 64'><g fill='none' stroke-linecap='round'><path d='M0 32 C20 6 60 6 80 32 S140 58 160 32' stroke='rgba(31,138,91,.45)' stroke-width='2.4'/><path d='M0 32 C20 58 60 58 80 32 S140 6 160 32' stroke='rgba(7,150,180,.4)' stroke-width='2.4'/>${[12, 26, 40, 54, 68, 92, 106, 120, 134, 148].map((x) => { const t = Math.round(Math.abs(Math.sin((x / 160) * Math.PI * 2) * 20) * 10) / 10; return `<line x1='${x}' y1='${32 - t}' x2='${x}' y2='${32 + t}' stroke='rgba(31,138,91,.28)' stroke-width='1.6'/>`; }).join("")}</g></svg>`,
)}")`;

const S = "[data-ile-style=aurore] section:has([data-ile-mix])";
const CSS = `
.v-vivant ${S} { background: rgba(239,243,241,.28) !important; }
.v-respire ${S} { background-size: 135% auto !important; animation: v-respire 16s ease-in-out infinite alternate; }
@keyframes v-respire { 0% { background-position: 40% 30%, 0 0; } 100% { background-position: 75% 55%, 0 0; } }
.v-defile ${S} { background: ${HELIX} 0 18%/320px 128px repeat-x, ${HELIX} 0 78%/320px 128px repeat-x, linear-gradient(180deg,#F4F8F6,#E6EFEB) !important; animation: v-defile 12s linear infinite; }
@keyframes v-defile { from { background-position: 0 18%, 160px 78%, 0 0; } to { background-position: 320px 18%, -160px 78%, 0 0; } }
.v-vivant [data-ile-mix-carte], .v-defile [data-ile-mix-carte] { background: rgba(255,255,255,.5) !important; }
@media (prefers-reduced-motion: reduce) { .v-respire ${S}, .v-defile ${S} { animation: none; } }
`;

function Sample({ variant }: { variant: (typeof VARIANTS)[number] }) {
  const [outcomes, setOutcomes] = useState<(IslandOutcome | undefined)[]>([]);
  return (
    <div className={`v-${variant.id} rounded-2xl border border-[#D9E2DF] bg-[#F3F5F7] p-4`}>
      <p className="text-[14px] font-bold text-[#0F2F2A]">{variant.label}</p>
      <p className="mb-3 text-[12.5px] text-[#4B6A62]">{variant.hint}</p>
      <div data-ile-style="aurore" data-isl="" className="flex justify-center">
        <div className="relative isolate">
          {/* L'hélice vivante derrière la bannière, coupée à sa forme ; la bannière devient translucide par-dessus. */}
          {variant.id === "vivant" && (
            <div className="absolute inset-0 -z-10 overflow-hidden rounded-[22px] bg-[#EFF3F1]">
              <HelixBackdrop position="contained" framing="app" className="[&_canvas]:scale-[1.6]" />
            </div>
          )}
          <MixIsland items={ITEMS} outcomes={outcomes} open onOpen={() => undefined} onFinish={() => setOutcomes([])} onAnswer={(index, outcome) => setOutcomes((list) => { const next = [...list]; next[index] = outcome; return next; })} />
        </div>
      </div>
    </div>
  );
}

export function LiveDna() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${CSS}`}</style>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[24px] font-bold text-[#0F2F2A]">L&apos;ADN vivant derrière la bannière du scan</h1>
        <p className="mt-1 text-[14px] text-[#4B6A62]">La bannière d&apos;aujourd&apos;hui, avec l&apos;hélice d&apos;ADN qui bouge. Passez la souris sur l&apos;essai 1 : l&apos;hélice réagit comme sur le site.</p>
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
