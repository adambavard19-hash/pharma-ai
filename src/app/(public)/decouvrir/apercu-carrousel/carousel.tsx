"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Robot } from "@/components/robot/robot";
import { cn } from "@/lib/utils";

/**
 * Le carrousel « façon limova.ai » (fondateur, 26 oct. 2026) : une grande carte sombre par fonction de PharmaBoost, la
 * conversation à gauche (le pharmacien demande, PharmaBoost répond), « Découvrez … » et ce qu'elle fait à droite ; les cartes
 * voisines dépassent sur les côtés, floues, et le carrousel avance tout seul. Les échanges sont des EXEMPLES ; les fonctions
 * existent toutes dans l'application.
 */
export type Slide = {
  name: string;
  tagline: string;
  ask: string;
  answers: string[];
  points: string[];
};

const AUTO_MS = 7000;

export function FeatureCarousel({ slides }: { slides: Slide[] }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const go = (delta: number) => setAt((n) => (n + delta + slides.length) % slides.length);

  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(() => setAt((n) => (n + 1) % slides.length), AUTO_MS);
    return () => window.clearTimeout(id);
  }, [at, paused, slides.length]);

  return (
    <div className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* Les onglets du haut : une pastille par fonction, celle affichée en clair. */}
      <div className="mx-auto mb-10 flex max-w-4xl flex-wrap justify-center gap-2 px-5">
        {slides.map((slide, index) => (
          <button
            key={slide.name}
            type="button"
            onClick={() => setAt(index)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition-all",
              index === at ? "border-white/15 bg-white/10 text-white" : "border-white/5 text-white/45 blur-[0.6px] hover:text-white/80 hover:blur-0",
            )}
          >
            <Robot size={20} mood={index === at ? "happy" : "idle"} /> {slide.name}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden py-2">
        <div className="flex transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]" style={{ transform: `translateX(calc(50% - (min(1100px, 88vw) / 2) - ${at} * (min(1100px, 88vw) + 32px)))` }}>
          {slides.map((slide, index) => (
            <article
              key={slide.name}
              aria-hidden={index !== at}
              className={cn(
                "mr-8 grid w-[min(1100px,88vw)] shrink-0 overflow-hidden rounded-[32px] border border-white/10 bg-[#1C2523] transition-[opacity,filter] duration-700 md:grid-cols-[0.9fr_1.1fr]",
                index === at ? "opacity-100" : "pointer-events-none opacity-35 blur-[2px]",
              )}
            >
              {/* La conversation. */}
              <div className="space-y-4 border-b border-white/10 p-6 md:border-r md:border-b-0 md:p-10">
                <p className="max-w-[92%] rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-[15px] leading-6 text-white/85">{slide.ask}</p>
                <div className="flex items-end gap-3 pt-4">
                  <span className="mb-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/90">
                    <Robot size={26} mood="happy" />
                  </span>
                  <div className="space-y-2.5">
                    {slide.answers.map((answer) => (
                      <p key={answer} className="rounded-2xl bg-white/[0.08] px-5 py-4 text-[15px] leading-6 text-white/90">{answer}</p>
                    ))}
                  </div>
                </div>
                <p className="pt-2 text-[11.5px] tracking-wide text-white/35 uppercase">Exemple</p>
              </div>

              {/* La fonction. */}
              <div className="flex flex-col p-6 md:p-10">
                <div className="flex items-center gap-5">
                  <span className="inline-flex size-[88px] shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-[#E6FAF4] to-[#BFEDE0] shadow-[0_12px_40px_-12px_rgba(53,214,170,0.6)]">
                    <Robot size={64} mood="happy" />
                  </span>
                  <div>
                    <h3 className="text-[28px] leading-tight font-bold tracking-[-0.03em] text-white md:text-[32px]">Découvrez {slide.name}</h3>
                    <p className="mt-1.5 text-[15.5px] leading-6 text-white/65">{slide.tagline}</p>
                  </div>
                </div>
                <ul className="mt-10 space-y-3">
                  {slide.points.map((point) => (
                    <li key={point} className="flex items-center gap-3.5 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3.5 text-[15.5px] text-white">
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[#35D6AA]/40 text-[#35D6AA]">
                        <Check className="size-3.5" aria-hidden="true" />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        <button type="button" onClick={() => go(-1)} aria-label="Précédent" className="absolute top-1/2 left-3 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur hover:bg-black/60 md:left-8">
          <ChevronLeft className="size-5" />
        </button>
        <button type="button" onClick={() => go(1)} aria-label="Suivant" className="absolute top-1/2 right-3 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur hover:bg-black/60 md:right-8">
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="mt-8 flex justify-center gap-2">
        {slides.map((slide, index) => (
          <button key={slide.name} type="button" aria-label={slide.name} onClick={() => setAt(index)} className={cn("h-1.5 rounded-full transition-all", index === at ? "w-8 bg-[#35D6AA]" : "w-1.5 bg-white/25")} />
        ))}
      </div>
    </div>
  );
}
