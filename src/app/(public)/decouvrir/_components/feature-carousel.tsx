"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Robot } from "@/components/robot/robot";
import type { RobotMood } from "@/core/robot/mascot";
import { cn } from "@/lib/utils";

/**
 * Les fonctions en grandes cartes qui défilent, la présentation de limova.ai (fondateur, 26 oct. 2026) aux couleurs de
 * PharmaBoost : « Découvrez … » et ce que la fonction fait (la conversation d'exemple a été retirée le 28 oct. 2026) ; les cartes voisines dépassent sur les côtés, estompées ; les pastilles du haut ; le défilement seul, mis en
 * pause au survol. Cartes en verre clair : l'encre ADN du site reste visible derrière. Les échanges sont des EXEMPLES.
 */
export type FeatureSlide = {
  tab: string;
  name: string;
  tagline: string;
  mood: RobotMood;
  ask: string;
  answers: string[];
  points: string[];
  action?: ReactNode;
};

const AUTO_MS = 8000;
/** Une carte, la fonction seule (fondateur, 28 oct. 2026 : « laisse la partie de droite seulement, enlève l'exemple »). */
const CARD = "min(720px, 88vw)";

export function FeatureCarousel({ slides }: { slides: FeatureSlide[] }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const go = (delta: number) => setAt((n) => (n + delta + slides.length) % slides.length);

  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(() => setAt((n) => (n + 1) % slides.length), AUTO_MS);
    return () => window.clearTimeout(id);
  }, [at, paused, slides.length]);

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="mx-auto mb-10 flex max-w-5xl flex-wrap justify-center gap-2 px-5" role="tablist">
        {slides.map((slide, index) => (
          <button
            key={slide.tab}
            type="button"
            role="tab"
            aria-selected={index === at}
            onClick={() => setAt(index)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border py-1.5 pr-4 pl-1.5 text-[14px] font-semibold transition-all",
              index === at
                ? "border-white bg-white text-text-primary shadow-[0_10px_30px_-14px_rgba(15,47,42,0.45)] dark:border-border-subtle dark:bg-surface-card"
                : "border-white/60 bg-white/40 text-text-tertiary backdrop-blur-md hover:text-text-primary dark:border-border-subtle dark:bg-surface-card/40",
            )}
          >
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950/40">
              <Robot size={22} mood={index === at ? slide.mood : "idle"} />
            </span>
            {slide.tab}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden py-4">
        <div
          className="flex transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(calc(50% - ${CARD} / 2 - ${at} * (${CARD} + 28px)))` }}
        >
          {slides.map((slide, index) => (
            <article
              key={slide.tab}
              aria-hidden={index !== at}
              inert={index !== at}
              className={cn(
                "mr-7 w-[min(720px,88vw)] shrink-0 overflow-hidden rounded-[32px] border border-white/80 bg-white/75 shadow-[0_30px_80px_-40px_rgba(15,47,42,0.45)] backdrop-blur-xl transition-[opacity,filter] duration-700 dark:border-border-subtle dark:bg-surface-card/85",
                index === at ? "opacity-100" : "opacity-40 blur-[3px]",
              )}
            >
              {/* La fonction. */}
              <div className="flex flex-col p-6 md:p-10">
                <div className="flex items-center gap-5">
                  <span className="inline-flex size-[88px] shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-[#E8FBF5] to-[#BDEBDD] shadow-[0_14px_40px_-14px_rgba(15,118,110,0.55)] ring-1 ring-white">
                    <Robot size={66} mood={slide.mood} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[26px] leading-tight font-bold tracking-[-0.03em] text-text-primary md:text-[32px]">Découvrez {slide.name}</h3>
                    <p className="mt-1.5 text-[15.5px] leading-6 text-text-secondary">{slide.tagline}</p>
                  </div>
                </div>
                {slide.action && <div className="mt-6">{slide.action}</div>}
                <ul className="mt-8 space-y-3">
                  {slide.points.map((point) => (
                    <li key={point} className="flex items-center gap-3.5 rounded-full border border-border-subtle bg-surface-app/70 px-5 py-3.5 text-[15.5px] font-medium text-text-primary">
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-brand-300 text-brand-600 dark:border-brand-800">
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

        <button type="button" onClick={() => go(-1)} aria-label="Fonction précédente" className="absolute top-1/2 left-2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-white/85 text-text-primary shadow-md backdrop-blur hover:bg-white md:left-6 dark:border-border-subtle dark:bg-surface-card">
          <ChevronLeft className="size-5" />
        </button>
        <button type="button" onClick={() => go(1)} aria-label="Fonction suivante" className="absolute top-1/2 right-2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-white/85 text-text-primary shadow-md backdrop-blur hover:bg-white md:right-6 dark:border-border-subtle dark:bg-surface-card">
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {slides.map((slide, index) => (
          <button key={slide.tab} type="button" aria-label={slide.tab} onClick={() => setAt(index)} className={cn("h-1.5 rounded-full transition-all", index === at ? "w-8 bg-brand-600" : "w-1.5 bg-text-tertiary/40")} />
        ))}
      </div>
    </div>
  );
}
