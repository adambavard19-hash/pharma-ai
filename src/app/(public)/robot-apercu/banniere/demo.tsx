"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { BANNER } from "../../../../../agent/src/banner-design";
import { CounterIsland, type IslandAdvice, type IslandPill } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { demoScenario, INITIAL_ISLAND, islandReducer, type IslandAction, type IslandStage, type IslandState } from "@/core/island/banner-flow";
import { cn } from "@/lib/utils";

/**
 * L'aperçu de la bannière en île : un écran de comptoir (le logiciel de gestion derrière), l'île en haut au centre avec
 * ses pastilles de services de part et d'autre, et de quoi la piloter — le scénario automatique en boucle, ou un bouton
 * par étape. Tout geste à la main met le scénario en pause.
 */

const STAGES: { stage: IslandStage; label: string }[] = [
  { stage: "idle", label: "En attente" },
  { stage: "scan", label: "Scan" },
  { stage: "analyzing", label: "Analyse" },
  { stage: "ready", label: "Conseils prêts" },
  { stage: "advice", label: "Conseils" },
  { stage: "email", label: "E-mail du bilan" },
  { stage: "emailSent", label: "E-mail envoyé" },
  { stage: "done", label: "Vente terminée" },
  { stage: "alert", label: "Mise en garde" },
  { stage: "quiet", label: "Rien à ajouter" },
];

const PILLS: IslandPill[] = [
  { key: "ventes", label: "Ventes du jour", value: "7 · 182 €" },
  { key: "challenge", label: "Challenge", value: "34 / 50" },
  { key: "poste", label: "Comptoir 1", value: "Connecté", dot: BANNER.colors.accent },
];

export function BannerIslandDemo({ items, drug, alert }: { items: IslandAdvice[]; drug: string; alert: { title: string; text: string } | null }) {
  const count = items.length;
  const reducer = useCallback((state: IslandState, action: IslandAction) => islandReducer(state, action, count), [count]);
  const [state, dispatch] = useReducer(reducer, INITIAL_ISLAND);
  const [auto, setAuto] = useState(true);
  const [step, setStep] = useState(0);
  const scenario = useRef(demoScenario(count));

  // Le scénario : chaque pas attend son temps, puis joue son geste ; à la fin, on recommence.
  useEffect(() => {
    if (!auto) return;
    const current = scenario.current[step];
    const id = setTimeout(() => {
      const action = current.action;
      if (action.type === "type") dispatch({ type: "email", value: action.value });
      else dispatch(action);
      setStep((i) => (i + 1) % scenario.current.length);
    }, current.wait);
    return () => clearTimeout(id);
  }, [auto, step]);

  const manual = (action: IslandAction) => {
    setAuto(false);
    dispatch(action);
  };

  return (
    <main className="min-h-dvh bg-[#EEF2F5] px-4 py-6 text-ink-900 sm:px-6">
      <style>{ISLAND_CSS}</style>
      <div className="mx-auto max-w-[1180px] space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11.5px] tracking-[0.14em] text-brand-700 uppercase">Aperçu de développement</p>
            <h1 className="mt-1 text-[26px] leading-tight font-bold tracking-[-0.02em]">La bannière du comptoir, en île</h1>
            <p className="mt-1 max-w-2xl text-[14px] text-text-secondary">Le robot vit dans la bannière : tout le parcours d&apos;une délivrance se joue dans l&apos;île. Survolez-la au repos, cliquez sur Vendu / Non vendu, tapez vite sur la capsule…</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setAuto((a) => !a)} className={cn("inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold", auto ? "bg-ink-900 text-white" : "border border-border-default bg-white text-ink-900")}>
              {auto ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              {auto ? "Scénario en cours" : "Lancer le scénario"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(0);
                dispatch({ type: "reset" });
                setAuto(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border-default bg-white px-3 text-[14px] font-medium"
              aria-label="Recommencer le scénario"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* L'écran du comptoir : le logiciel de gestion derrière, l'île posée en haut au centre. */}
        <section aria-label="Écran du comptoir (exemple)" className="relative overflow-hidden rounded-[22px] border border-black/10 shadow-xl" style={{ background: "radial-gradient(120% 90% at 20% 10%, #2A2F4A 0%, #171A2B 45%, #0E1020 100%)" }}>
          <LgoBackdrop />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-3">
            <div className="pointer-events-auto flex items-start gap-2.5">
              <ServicePill pill={PILLS[0]} className="mt-1.5 hidden md:flex" />
              <CounterIsland
                state={state}
                items={items}
                drug={drug}
                alert={alert}
                pills={PILLS}
                onAnswer={(index, outcome) => manual({ type: "answer", index, outcome })}
                onEmail={(value) => manual({ type: "email", value })}
                onSendEmail={() => manual({ type: "go", stage: "emailSent" })}
                onAddEmail={() => manual({ type: "go", stage: "email" })}
                onFinish={() => manual({ type: "go", stage: "done" })}
                onDismissAlert={() => manual({ type: "go", stage: "idle" })}
              />
              <div className="mt-1.5 hidden flex-col gap-1.5 md:flex">
                <ServicePill pill={PILLS[1]} />
                <ServicePill pill={PILLS[2]} />
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Piloter l'aperçu" className="rounded-2xl border border-border-subtle bg-white p-4">
          <p className="mb-2.5 text-[12px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">Aller à une étape (met le scénario en pause)</p>
          <div className="flex flex-wrap gap-2">
            {STAGES.map(({ stage, label }) => (
              <button
                key={stage}
                type="button"
                onClick={() => {
                  manual({ type: "go", stage });
                  if (stage === "analyzing") {
                    // L'analyse se coche d'elle-même, une ligne après l'autre.
                    for (let i = 1; i <= 4; i++) setTimeout(() => dispatch({ type: "tick" }), i * 650);
                  }
                }}
                aria-pressed={state.stage === stage}
                className={cn("h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors", state.stage === stage ? "border-ink-900 bg-ink-900 text-white" : "border-border-default bg-surface-app text-text-secondary hover:border-ink-400 hover:text-text-primary")}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] leading-5 text-text-tertiary">
            Textes et couleurs : ceux de la bannière Windows actuelle. Conseils d&apos;exemple : deux vraies règles du moteur pour une doxycycline (produits du catalogue de démonstration) ; mise en garde : vraie règle de vigilance (Thésaurus ANSM). Aucune donnée réelle.
          </p>
        </section>
      </div>
    </main>
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

/** Le logiciel de gestion de l'officine, flou derrière : un décor, pas une copie. */
function LgoBackdrop() {
  return (
    <div aria-hidden="true" className="px-4 pt-[300px] pb-6 sm:px-10 sm:pt-[320px]">
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
            <div className="h-24 rounded-md bg-white" />
          </div>
          <div className="space-y-2">
            <div className="h-16 rounded-md bg-white" />
            <div className="h-16 rounded-md bg-white" />
            <div className="h-10 rounded-md bg-[#1E6F8A]" />
          </div>
        </div>
      </div>
    </div>
  );
}
