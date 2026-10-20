"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { BANNER } from "../../../agent/src/banner-design";
import { cn } from "@/lib/utils";
import { CounterIsland, type IslandAdvice, type IslandPill } from "./counter-island";
import { MixIsland } from "./mix-island";
import { ISLAND_CSS } from "./island-shell";
import { AURORE_CSS } from "./island-aurore";
import { useDemoScenario } from "./use-demo-scenario";

const PILLS: IslandPill[] = [
  { key: "ventes", label: "Ventes du jour", value: "7 · 182 €" },
  { key: "challenge", label: "Challenge", value: "34 / 50" },
  { key: "poste", label: "Comptoir 1", value: "Connecté", dot: BANNER.colors.accent },
];

/**
 * L'île du comptoir en démonstration : le scénario validé joué en boucle (exemple, aucune donnée réelle). `framed` : sur un
 * écran de comptoir (le logiciel de gestion derrière), pour la section « Au comptoir » du site ; sinon l'île seule (dans
 * l'île du site). Ne joue que lorsqu'elle est à l'écran ; un geste du visiteur lui rend la main.
 */
/** `mixOnly` : toujours la bannière d'aujourd'hui (la « mix », papier ADN), le scénario n'y joue que les réponses (fondateur, 20 oct. 2026). */
export function CounterIslandScene({ items, drug, alert, framed = false, mixOnly = false }: { items: IslandAdvice[]; drug: string; alert: { title: string; text: string } | null; framed?: boolean; mixOnly?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = box.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const { state, auto, manual, restart } = useDemoScenario(items.length, visible);

  // Aux conseils, la bannière du comptoir telle qu'elle est aujourd'hui (la « mix », papier ADN ; fondateur, 20 oct. 2026).
  const island = mixOnly || state.stage === "advice" ? (
    <MixIsland items={items} outcomes={state.outcomes} open onOpen={() => undefined} onFinish={() => manual({ type: "go", stage: "done" })} onAnswer={(index, outcome) => manual({ type: "answer", index, outcome })} />
  ) : (
    <CounterIsland
      state={state}
      items={items}
      drug={drug}
      alert={alert}
      pills={PILLS}
      listMaxHeight={380}
      onAnswer={(index, outcome) => manual({ type: "answer", index, outcome })}
      onEmail={(value) => manual({ type: "email", value })}
      onSendEmail={() => manual({ type: "go", stage: "emailSent" })}
      onAddEmail={() => manual({ type: "go", stage: "email" })}
      onFinish={() => manual({ type: "go", stage: "done" })}
      onDismissAlert={() => manual({ type: "go", stage: "idle" })}
    />
  );

  if (!framed)
    return (
      <div ref={box} data-ile-style="aurore" className="flex flex-col items-center gap-1.5 [&>div]:max-w-full [&_section]:max-w-full">
        <style>{`${ISLAND_CSS}\n${AURORE_CSS}`}</style>
        {island}
        {!auto && (
          <button type="button" onClick={restart} className="inline-flex items-center gap-1.5 text-[11.5px] text-white/50 hover:text-white/80">
            <RotateCcw className="size-3" aria-hidden="true" /> Rejouer l&apos;exemple
          </button>
        )}
      </div>
    );

  return (
    <div ref={box} data-ile-style="aurore" className="relative overflow-hidden rounded-[26px] border border-black/10 shadow-xl" style={{ background: "radial-gradient(120% 90% at 20% 10%, #2A2F4A 0%, #171A2B 45%, #0E1020 100%)" }}>
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}`}</style>
      <LgoBackdrop />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-3 pt-4">
        <div className="pointer-events-auto flex max-w-full items-start gap-2.5">
          <ServicePill pill={PILLS[0]} className="mt-1.5 hidden lg:flex" />
          <div className="max-w-full min-w-0 [&_section]:max-w-full">{island}</div>
          <div className="mt-1.5 hidden flex-col gap-1.5 lg:flex">
            <ServicePill pill={PILLS[1]} />
            <ServicePill pill={PILLS[2]} />
          </div>
        </div>
      </div>
      <div className="absolute right-4 bottom-4 flex items-center gap-2">
        <span className="rounded-full bg-black/40 px-2.5 py-1 text-[11px] text-white/70">Exemple, aucune donnée réelle</span>
        {!auto && (
          <button type="button" onClick={restart} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/90 px-3 text-[12px] font-semibold text-[#0B0F14]">
            <RotateCcw className="size-3.5" aria-hidden="true" /> Rejouer
          </button>
        )}
      </div>
    </div>
  );
}

function ServicePill({ pill, className }: { pill: IslandPill; className?: string }) {
  return (
    <div className={cn("flex h-9 items-center gap-2 rounded-full bg-[#0B0F14]/90 px-3.5 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_10px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur", className)}>
      {pill.dot && <span className="size-1.5 rounded-full" style={{ background: pill.dot, boxShadow: `0 0 6px ${pill.dot}` }} />}
      <span className="text-[11px] font-medium text-white/55">{pill.label}</span>
      <span className="text-[12.5px] font-semibold tabular-nums">{pill.value}</span>
    </div>
  );
}

/** Le logiciel de gestion de l'officine, derrière : un décor, pas une copie. */
function LgoBackdrop() {
  return (
    <div aria-hidden="true" className="px-4 pt-[330px] pb-12 sm:px-10 sm:pt-[360px]">
      <div className="mx-auto max-w-[980px] overflow-hidden rounded-xl bg-[#E9EDF1]/95 shadow-2xl">
        <div className="flex h-8 items-center gap-1.5 bg-[#C9D3DC] px-3">
          <span className="size-2.5 rounded-full bg-[#FF5F57]" />
          <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="size-2.5 rounded-full bg-[#28C840]" />
          <span className="ml-3 text-[11px] font-semibold text-[#4A5A68]">Logiciel de gestion — Délivrance</span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            {["DOXYCYCLINE 100 mg — 1 boîte", "Ordonnance du jour", "Tiers payant"].map((line) => (
              <div key={line} className="flex h-9 items-center rounded-md bg-white px-3 text-[12px] text-[#4A5A68]">
                {line}
              </div>
            ))}
            <div className="h-20 rounded-md bg-white" />
          </div>
          <div className="hidden space-y-2 sm:block">
            <div className="h-16 rounded-md bg-white" />
            <div className="h-16 rounded-md bg-white" />
            <div className="h-10 rounded-md bg-[#1E6F8A]" />
          </div>
        </div>
      </div>
    </div>
  );
}
