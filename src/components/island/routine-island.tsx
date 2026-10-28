"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, Layers, X } from "lucide-react";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { IslandShell } from "./island-shell";
import { centsOf, eurosOf } from "./mix-island";

/**
 * La routine au comptoir (fondateur, 28 oct. 2026 : « en plus du conseil, proposer la routine ») : un repère dans la petite
 * bannière, puis, au clic, une DEUXIÈME bannière à part, du même dessin que la bannière du conseil, avec les étapes de la
 * routine — un produit du stock par étape. Quatre présentations à l'essai (`RoutineLook`), choisies sur /robot-apercu/routine.
 */

export type RoutineStep = {
  /** « Nettoyer », « Hydrater », « Traiter les boutons ». */
  label: string;
  name: string;
  price?: string;
  margin?: string;
  stock?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";
  quantity?: number;
  image?: string;
  benefit?: string;
};

export type IslandRoutine = { title: string; drug?: string; steps: RoutineStep[] };

/**
 * A. une pastille « Routine · 3 » parmi les repères du conseil ; B. une ligne à part sous le conseil, les étapes en clair ;
 * C. les photos des étapes en petit, à droite ; D. une petite bannière à part, toujours visible sous la première.
 */
export type RoutineLook = "A" | "B" | "C" | "D";

const INK = "#0F2F2A";
const GREEN = "#0E8A7B";
const MUTED = "#5B6B66";
/** La couleur de la routine : un violet doux, à part du vert du conseil, du jaune de la marge et de l'orange du surstock. */
const ROUTINE_BG = "#E4DDFF";
const ROUTINE_FG = "#3B2A86";
const ROUTINE_DOT = "#6B55D6";
/** Sur le fond sombre de la petite bannière : le violet clair et le blanc. */
const ROUTINE_LIGHT = "#CFC4FF";
const ON_DARK = "#F2FFF9";

/** Le prix de toute la routine : la somme des prix connus. */
export function routineTotal(routine: IslandRoutine): { price: string | null; margin: string | null } {
  const price = routine.steps.reduce((sum, step) => sum + centsOf(step.price), 0);
  const margin = routine.steps.reduce((sum, step) => sum + centsOf(step.margin), 0);
  return { price: price > 0 ? eurosOf(price) : null, margin: margin > 0 ? eurosOf(margin) : null };
}

/** A. La pastille, à côté du stock et de la marge du conseil. */
export function RoutineChip({ routine, open, onToggle }: { routine: IslandRoutine; open: boolean; onToggle: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      data-ile-routine-pastille=""
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.stopPropagation();
          onToggle();
        }
      }}
      className="inline-flex h-[18px] cursor-pointer items-center gap-1 rounded-full px-1.5 text-[10.5px] font-bold whitespace-nowrap ring-1 ring-[#6B55D6]/30"
      style={{ background: open ? ROUTINE_DOT : ROUTINE_BG, color: open ? "#FFFFFF" : ROUTINE_FG }}
    >
      <Layers className="size-3" aria-hidden="true" />
      Routine · {routine.steps.length}
    </span>
  );
}

/** B. Une ligne à part dans la petite bannière : « Routine — Nettoyer › Hydrater › Boutons ». */
export function RoutineLine({ routine, open, onToggle }: { routine: IslandRoutine; open: boolean; onToggle: () => void }) {
  const total = routineTotal(routine);
  return (
    <button
      type="button"
      data-ile-routine-ligne=""
      onClick={onToggle}
      className="mx-2 mb-1.5 flex w-[calc(100%-16px)] items-center gap-2 rounded-lg px-2.5 py-1.5 text-left"
      style={{ background: "rgba(150,128,255,0.22)" }}
    >
      <Layers className="size-3.5 shrink-0" style={{ color: ROUTINE_LIGHT }} aria-hidden="true" />
      <span className="shrink-0 text-[11.5px] font-bold" style={{ color: ROUTINE_LIGHT }}>Routine</span>
      <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold" style={{ color: ON_DARK }}>
        {routine.steps.map((step) => step.label).join(" › ")}
      </span>
      {total.price && <span className="shrink-0 text-[11.5px] font-bold tabular-nums" style={{ color: "#9FF0C8" }}>{total.price}</span>}
      {open ? <ChevronDown className="size-3.5 shrink-0" style={{ color: ROUTINE_LIGHT }} aria-hidden="true" /> : <ChevronRight className="size-3.5 shrink-0" style={{ color: ROUTINE_LIGHT }} aria-hidden="true" />}
    </button>
  );
}

/** C. Les photos des étapes, en petit et en éventail, avec le mot « Routine » : à droite de la petite bannière. */
export function RoutineThumbs({ routine, open, onToggle }: { routine: IslandRoutine; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" data-ile-routine-photos="" onClick={onToggle} className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-1 py-0.5" aria-label={`Voir la routine : ${routine.title}`}>
      <span className="flex -space-x-2.5">
        {routine.steps.map((step, index) => (
          <span key={step.name} className="inline-flex size-[24px] items-center justify-center overflow-hidden rounded-full bg-white ring-2" style={{ zIndex: routine.steps.length - index, ["--tw-ring-color" as string]: open ? ROUTINE_DOT : "#FFFFFF" }}>
            {step.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- photo studio locale, déjà dimensionnée
              <img src={step.image} alt="" width={22} height={22} className="size-full object-contain p-0.5" />
            ) : (
              <span className="text-[10px] font-bold" style={{ color: ROUTINE_FG }}>{index + 1}</span>
            )}
          </span>
        ))}
      </span>
      <span className="text-[9.5px] font-bold tracking-[0.08em] uppercase" style={{ color: ROUTINE_LIGHT }}>Routine</span>
    </button>
  );
}

/**
 * E/F. Le mot « Routine » qui clignote doucement, juste à côté du nom du conseil (fondateur, 28 oct. 2026) ; la deuxième
 * bannière s'ouvre AU SURVOL (`onHover`), sans clic. `badge` : en pastille violette pleine, sinon le mot seul.
 */
export function RoutineBlink({ open, onHover, badge = false }: { open: boolean; onHover: () => void; badge?: boolean }) {
  return (
    <span
      data-ile-routine-clignote=""
      onPointerEnter={onHover}
      onClick={(event) => {
        event.stopPropagation();
        onHover();
      }}
      className={`routine-blink inline-flex shrink-0 cursor-pointer items-center gap-1 ${badge ? "h-[18px] rounded-full px-1.5 text-[10px]" : "text-[10.5px]"} font-bold tracking-[0.06em] uppercase`}
      style={badge ? { background: open ? "#FFFFFF" : ROUTINE_DOT, color: open ? ROUTINE_FG : "#FFFFFF" } : { color: ROUTINE_LIGHT }}
    >
      {badge && <Layers className="size-3" aria-hidden="true" />}
      Routine
    </span>
  );
}

/** Le clignotement doux du mot « Routine » (coupé si la personne a demandé moins de mouvement). */
export const ROUTINE_CSS = `
@keyframes routine-blink{0%,100%{opacity:1;filter:drop-shadow(0 0 0 rgba(207,196,255,0))}50%{opacity:.45;filter:drop-shadow(0 0 6px rgba(207,196,255,.9))}}
.routine-blink{animation:routine-blink 1.6s ease-in-out infinite;text-shadow:none!important}
.routine-blink:hover{animation:none;opacity:1}
@media (prefers-reduced-motion:reduce){.routine-blink{animation:none}}
`;

/** D. La petite bannière à part, toujours visible sous la première : une seule ligne, elle s'ouvre au clic. */
export function RoutineMiniIsland({ routine, open, onToggle, width }: { routine: IslandRoutine; open: boolean; onToggle: () => void; width: number }) {
  const total = routineTotal(routine);
  if (open) return null;
  return (
    <IslandShell width={width} tone="neutral" contentKey="routine-mini" label="Routine proposée (cliquez pour la voir)">
      <button type="button" data-ile-routine-mini="" onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full" style={{ background: ROUTINE_BG, color: ROUTINE_FG }}>
          <Layers className="size-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-bold" style={{ color: ON_DARK }}>Routine · {routine.steps.length} étapes</span>
          <span className="block truncate text-[10.5px] font-semibold" style={{ color: ROUTINE_LIGHT }}>{routine.steps.map((step) => step.label).join(" › ")}</span>
        </span>
        {total.price && <span className="shrink-0 text-[12.5px] font-bold tabular-nums" style={{ color: "#9FF0C8" }}>{total.price}</span>}
        <ChevronRight className="size-4 shrink-0" style={{ color: ROUTINE_LIGHT }} aria-hidden="true" />
      </button>
    </IslandShell>
  );
}

/**
 * La deuxième bannière, ouverte : le titre de la routine, le prix et la marge de l'ensemble, puis une ligne par étape (photo,
 * étape, produit, prix, stock). `cards` : les étapes côte à côte en petites cartes (essai C), sinon en liste.
 */
export function RoutineIsland({ routine, width, cards = false, onClose, onPointerLeave }: { routine: IslandRoutine; width: number; cards?: boolean; onClose: () => void; onPointerLeave?: () => void }) {
  const total = routineTotal(routine);
  return (
    <IslandShell width={width} tone="accent" contentKey={cards ? "routine-cartes" : "routine-liste"} label={`Routine : ${routine.title}`} onPointerLeave={onPointerLeave}>
      <div data-ile-routine="" className="relative overflow-hidden rounded-[22px] bg-[#EFF3F1]">
        <div className="pointer-events-none absolute inset-0 isolate" aria-hidden="true">
          <HelixBackdrop position="contained" framing="app" lazy className="[&_canvas]:scale-[1.6]" />
        </div>
        <div className="relative p-2.5">
          <div className="rounded-[18px] bg-white p-3 shadow-[0_12px_32px_-18px_rgba(15,43,38,0.55)]" style={{ color: INK }}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full" style={{ background: ROUTINE_BG, color: ROUTINE_FG }}>
                <Layers className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: ROUTINE_DOT }}>
                  Routine{routine.drug ? ` · pour ${routine.drug}` : ""}
                </p>
                <p className="text-[15px] leading-[19px] font-bold tracking-[-0.02em]">{routine.title}</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Fermer la routine" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0F2F2A]/8 text-[#0F2F2A] hover:bg-[#0F2F2A]/15">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            {cards ? (
              <div className="mt-2.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${routine.steps.length}, minmax(0, 1fr))` }}>
                {routine.steps.map((step, index) => (
                  <div key={step.name} className="flex flex-col items-center rounded-xl border p-1.5 text-center" style={{ borderColor: "#E3EBE8" }}>
                    <StepNumber n={index + 1} />
                    <Photo step={step} size={44} />
                    <p className="mt-1 text-[9.5px] font-bold tracking-[0.1em] uppercase" style={{ color: ROUTINE_DOT }}>{step.label}</p>
                    <p className="line-clamp-2 text-[11px] leading-[14px] font-semibold">{step.name}</p>
                    <p className="mt-0.5 text-[11.5px] font-bold tabular-nums" style={{ color: GREEN }}>{step.price ?? "—"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <ol className="mt-2.5 space-y-1.5">
                {routine.steps.map((step, index) => (
                  <li key={step.name} className="flex items-center gap-2.5 rounded-xl border px-2 py-1.5" style={{ borderColor: "#E3EBE8" }}>
                    <StepNumber n={index + 1} />
                    <Photo step={step} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[9.5px] font-bold tracking-[0.1em] uppercase" style={{ color: ROUTINE_DOT }}>{step.label}</span>
                      <span className="block truncate text-[12.5px] font-semibold">{step.name}</span>
                      {step.benefit && <span className="block truncate text-[10.5px]" style={{ color: MUTED }}>{step.benefit}</span>}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-[12.5px] font-bold tabular-nums" style={{ color: GREEN }}>{step.price ?? "—"}</span>
                      <StockDot step={step} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-2.5 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: "#F3F7F5" }}>
              <span className="flex-1">Toute la routine</span>
              {total.margin && <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: "#FFF5D6", color: "#9A6400" }}>Marge {total.margin}</span>}
              {total.price && <span className="text-[13px] font-bold tabular-nums" style={{ color: GREEN }}>{total.price}</span>}
            </div>
          </div>
        </div>
      </div>
    </IslandShell>
  );
}

function StepNumber({ n }: { n: number }): ReactNode {
  return <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white" style={{ background: ROUTINE_DOT }}>{n}</span>;
}

/** La photo studio de l'étape ; sans photo studio, une case vide discrète (jamais une photo amateur). */
function Photo({ step, size }: { step: RoutineStep; size: number }): ReactNode {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-[#E3EBE8]" style={{ width: size, height: size }}>
      {step.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- photo studio locale, déjà dimensionnée
        <img src={step.image} alt="" width={size - 6} height={size - 6} className="size-full object-contain p-0.5" />
      ) : (
        <Layers className="size-4" style={{ color: "#C9D6D1" }} aria-hidden="true" />
      )}
    </span>
  );
}

function StockDot({ step }: { step: RoutineStep }): ReactNode {
  const color = step.stock === "IN_STOCK" ? "#1E9E6A" : step.stock === "LOW_STOCK" ? "#D9822B" : step.stock === "OUT_OF_STOCK" ? "#D64545" : "#8A9A95";
  const label = step.stock === "IN_STOCK" ? "En stock" : step.stock === "LOW_STOCK" ? "Stock faible" : step.stock === "OUT_OF_STOCK" ? "Rupture" : "À vérifier";
  return (
    <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold" style={{ color }}>
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
      {step.quantity !== undefined ? ` · ${step.quantity}` : ""}
    </span>
  );
}
