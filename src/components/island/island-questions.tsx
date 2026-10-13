"use client";

import type { ReactNode } from "react";
import { BANNER } from "../../../agent/src/banner-design";
import { STAGE_WIDTH } from "@/core/island/banner-flow";
import { IslandShell } from "./island-shell";

const C = BANNER.colors;
const T = BANNER.text;

export type IslandQuestion = { node: string; text: string; choices: { key: string; label: string; selected: boolean }[] };

/**
 * La capsule « Une question à poser » de la bannière du comptoir, sous l'île des conseils : les questions de l'arbre
 * (`core/counter/question-tree.ts`), leurs choix (le choix coché en vert), et les phrases d'orientation. Le poste de caisse
 * la branche sur l'agent Windows (`onChoose`) ; le site la montre en exemple, sans `onChoose` : les choix s'y lisent sans
 * être des boutons.
 */
export function IslandQuestions({
  questions,
  contentKey,
  robot,
  guidance = [],
  onChoose,
  footer,
  maxHeight = 180,
}: {
  questions: IslandQuestion[];
  /** Change quand les questions changent (une autre vente) : rejoue le fondu d'entrée. */
  contentKey: string;
  /** Le robot devant le titre : seulement quand la capsule est seule (aucun conseil encore). */
  robot?: ReactNode;
  guidance?: string[];
  onChoose?: (node: string, choice: string) => void;
  footer?: ReactNode;
  /** Hauteur de la liste, en pixels, au-delà de laquelle elle défile (poste : 180). `null` : tout se lit, sans défilement. */
  maxHeight?: number | null;
}) {
  return (
    <IslandShell width={STAGE_WIDTH.advice} contentKey={contentKey} label={T.questionTitle}>
      <div className="px-3 pt-2.5 pb-3">
        <div className="flex items-center gap-2.5">
          {robot}
          <div className="min-w-0">
            <p className="text-[13.5px] leading-[18px] font-semibold">{T.questionTitle}</p>
            <p className="truncate text-[12px] leading-4 text-white/60">{T.questionSub}</p>
          </div>
        </div>
        {/* Hauteur bornée : les questions défilent dans l'île, le logiciel de gestion reste visible. */}
        <div className="isl-scroll mt-2 space-y-2 overflow-y-auto overscroll-contain" style={maxHeight === null ? undefined : { maxHeight }}>
          {questions.map((question) => (
            <div key={question.node} className="rounded-xl bg-white/[0.06] px-2.5 py-2">
              <p className="text-[12.5px] leading-[18px] text-white/90">{question.text}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {question.choices.map((choice) => {
                  const className = "inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold transition-colors";
                  const style = choice.selected ? { background: C.accent, color: "#04261A" } : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.9)" };
                  return onChoose ? (
                    <button key={choice.key} type="button" onClick={() => onChoose(question.node, choice.key)} className={className} style={style}>
                      {choice.label}
                    </button>
                  ) : (
                    <span key={choice.key} className={className} style={style} data-selected={choice.selected ? "" : undefined}>
                      {choice.label}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
          {guidance.map((line) => (
            <p key={line} className="rounded-2xl px-3 py-2 text-[12.5px] leading-[18px]" style={{ background: "rgba(54,232,200,0.10)", color: "#BFF7EA" }}>{line}</p>
          ))}
        </div>
        {footer}
      </div>
    </IslandShell>
  );
}
