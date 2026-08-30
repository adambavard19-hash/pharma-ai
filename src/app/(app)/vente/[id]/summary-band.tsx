"use client";

import { AlertTriangle, Check, Pill, ShieldAlert, ShieldCheck, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Le bandeau de synthèse — les quatre choses à savoir, en deux secondes.
 *
 * Il ne montre RIEN qu'on ne puisse retrouver plus bas. Sa seule fonction est
 * l'ordre de lecture : sécurité d'abord, puis ce qu'on délivre, puis ce qu'on
 * dit, puis ce qu'on peut proposer. Un pharmacien qui n'a que deux secondes
 * doit pouvoir s'arrêter ici.
 *
 * Une règle de couleur, la même partout dans l'écran :
 *   rouge   — action indispensable, jamais repliable ;
 *   orange  — à vérifier ;
 *   vert    — conseil ou accompagnement validable ;
 *   neutre  — information.
 *
 * Aucun chiffre n'est décoratif : chacun vient du moteur. Quand il n'y a rien
 * à signaler, la ligne le dit — c'est une réponse, pas un vide.
 */

export type SummaryTone = "danger" | "warning" | "success" | "neutral";

export type SummaryRow = {
  key: string;
  icon: LucideIcon;
  label: string;
  /** Le chiffre ou l'état, en une poignée de mots. */
  value: string;
  /** Précision facultative, plus discrète. */
  detail?: string;
  tone: SummaryTone;
  /** Ancre de la zone correspondante : le bandeau y conduit, il ne la remplace pas. */
  href: string;
};

const TONE_STYLES: Record<SummaryTone, { dot: string; value: string }> = {
  danger: {
    dot: "bg-danger-600 text-white",
    value: "text-danger-700 dark:text-danger-400",
  },
  warning: {
    dot: "bg-warning-100 text-warning-700 dark:bg-warning-900 dark:text-warning-400",
    value: "text-warning-800 dark:text-warning-400",
  },
  success: {
    dot: "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300",
    value: "text-text-primary",
  },
  neutral: {
    dot: "bg-surface-sunken text-text-tertiary",
    value: "text-text-primary",
  },
};

export function SummaryBand({ rows }: { rows: SummaryRow[] }) {
  return (
    <nav aria-label="Synthèse de l'analyse" className="overflow-hidden rounded-xl border border-border-subtle bg-surface-card">
      <ul className="divide-y divide-border-subtle">
        {rows.map((row) => {
          const style = TONE_STYLES[row.tone];
          const Icon = row.icon;
          return (
            <li key={row.key}>
              <a
                href={row.href}
                className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-sunken/60 focus-visible:bg-surface-sunken/60 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg",
                    style.dot,
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="w-[9.5rem] shrink-0 text-[12.5px] text-text-tertiary">
                  {row.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("text-[13.5px] font-medium", style.value)}>{row.value}</span>
                  {row.detail && (
                    <span className="ml-2 text-[12.5px] text-text-tertiary">{row.detail}</span>
                  )}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Construit les quatre lignes à partir de ce que le moteur a réellement produit.
 *
 * Aucun de ces chiffres n'est estimé. Quand une information n'existe pas — les
 * interactions, tant que leur source n'est pas branchée — la ligne ne la
 * mentionne pas : elle ne prétend pas non plus l'avoir vérifiée.
 */
export function buildSummaryRows(input: {
  blockingCount: number;
  attentionCount: number;
  lineCount: number;
  inStock: number;
  missing: number;
  unknown: number;
  explainedCount: number;
  recommendationCount: number;
  locked: boolean;
}): SummaryRow[] {
  const stockDetails = [
    input.inStock > 0 ? `${input.inStock} en stock` : null,
    input.missing > 0 ? `${input.missing} à commander` : null,
    input.unknown > 0 ? `${input.unknown} non rattaché${input.unknown > 1 ? "s" : ""}` : null,
  ].filter(Boolean);

  return [
    {
      key: "securite",
      icon: input.blockingCount > 0 ? ShieldAlert : input.attentionCount > 0 ? AlertTriangle : ShieldCheck,
      label: "Sécurité",
      value:
        input.blockingCount > 0
          ? `${input.blockingCount} point${input.blockingCount > 1 ? "s" : ""} à vérifier`
          : input.attentionCount > 0
            ? `${input.attentionCount} point${input.attentionCount > 1 ? "s" : ""} de vigilance`
            : "Aucun point de sécurité détecté",
      detail: input.blockingCount > 0 ? "à acquitter avant tout conseil" : undefined,
      tone: input.blockingCount > 0 ? "danger" : input.attentionCount > 0 ? "warning" : "success",
      href: "#zone-securite",
    },
    {
      key: "ordonnance",
      icon: Pill,
      label: "Ordonnance",
      value: `${input.lineCount} médicament${input.lineCount > 1 ? "s" : ""}`,
      detail: stockDetails.length > 0 ? stockDetails.join(" · ") : undefined,
      tone: input.missing > 0 ? "warning" : "neutral",
      href: "#zone-traitement",
    },
    {
      key: "conseil",
      icon: Check,
      label: "Conseil patient",
      value:
        input.explainedCount > 0
          ? `${input.explainedCount} traitement${input.explainedCount > 1 ? "s" : ""} expliqué${input.explainedCount > 1 ? "s" : ""}`
          : "Aucune explication disponible",
      tone: "neutral",
      href: "#zone-traitement",
    },
    {
      key: "accompagnement",
      icon: ShoppingBag,
      label: "Accompagnement",
      value: input.locked
        ? "En attente de la vérification de sécurité"
        : input.recommendationCount > 0
          ? `${input.recommendationCount} proposition${input.recommendationCount > 1 ? "s" : ""} pertinente${input.recommendationCount > 1 ? "s" : ""}`
          : "Aucune recommandation complémentaire pertinente",
      tone: input.locked ? "warning" : input.recommendationCount > 0 ? "success" : "neutral",
      href: "#zone-conseils",
    },
  ];
}
