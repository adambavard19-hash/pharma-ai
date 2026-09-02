"use client";

import { AlertTriangle, Pill, ShieldAlert, ShieldCheck, ShoppingBag } from "lucide-react";
import { adviceTone, safetySummaryTone, type CounterTone } from "@/config/counter-tone";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Le bandeau de synthèse — les trois choses à savoir, en deux secondes.
 *
 * Trois lignes, une par zone de l'écran, dans l'ordre où elles se lisent :
 * sécurité, traitement, conseils. Le bandeau est une table des matières, pas un
 * résumé : il ne montre rien qu'on ne puisse retrouver plus bas, et chaque
 * ligne conduit à sa zone.
 *
 * Une quatrième ligne disait « 2 traitements expliqués ». Elle était toujours
 * neutre, toujours satisfaite, et donc jamais lue. Ce qui mérite une seconde
 * d'attention, c'est l'inverse : un traitement SANS explication. Il apparaît
 * maintenant en précision de la ligne « Ordonnance », et seulement quand il
 * existe.
 *
 * Les couleurs viennent toutes de `@/config/counter-tone` : aucun ton n'est
 * décidé ici. Aucun chiffre n'est estimé — chacun vient du moteur.
 */

export type SummaryTone = CounterTone;

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
  /**
   * Le geste qui résout cette ligne, nommé.
   *
   * Une ligne rouge ou orange qui n'indique pas quoi faire laisse le pharmacien
   * chercher. Elle n'apparaît que là où il y a réellement quelque chose à
   * faire : sur une ligne neutre, un verbe serait du bruit.
   */
  action?: string;
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
    <nav
      aria-label="Synthèse de l'analyse"
      className="overflow-hidden rounded-xl border border-border-subtle bg-surface-card"
    >
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
                {row.action && (
                  <span
                    className={cn(
                      "shrink-0 text-[12.5px] font-medium",
                      row.tone === "danger"
                        ? "text-danger-700 dark:text-danger-400"
                        : "text-brand-700 dark:text-brand-400",
                    )}
                  >
                    {row.action} →
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Construit les trois lignes à partir de ce que le moteur a réellement produit.
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
  /** Les lignes ont été retenues par la lecture ; personne n'a encore validé. */
  awaitingValidation: boolean;
}): SummaryRow[] {
  const unexplained = Math.max(0, input.lineCount - input.explainedCount);

  const treatmentDetails = [
    input.inStock > 0 ? `${input.inStock} en stock` : null,
    input.missing > 0 ? `${input.missing} à commander` : null,
    input.unknown > 0 ? `${input.unknown} non rattaché${input.unknown > 1 ? "s" : ""}` : null,
    // L'exception, pas la règle : un traitement expliqué ne mérite pas d'être
    // annoncé, un traitement sans explication si.
    unexplained > 0 ? `${unexplained} sans explication` : null,
  ].filter(Boolean);

  // La pré-confirmation a changé ce que « 2 médicaments » veut dire : ils ont
  // pu être retenus par la lecture seule. Le bandeau doit le dire, sans quoi il
  // affirmerait un traitement établi là où rien n'est encore signé.
  const treatmentTone: SummaryTone =
    input.awaitingValidation || input.missing > 0 || input.unknown > 0 ? "warning" : "neutral";

  return [
    {
      key: "securite",
      icon:
        input.blockingCount > 0
          ? ShieldAlert
          : input.attentionCount > 0
            ? AlertTriangle
            : ShieldCheck,
      label: "Sécurité",
      value:
        input.blockingCount > 0
          ? `${input.blockingCount} point${input.blockingCount > 1 ? "s" : ""} à vérifier`
          : input.attentionCount > 0
            ? `${input.attentionCount} point${input.attentionCount > 1 ? "s" : ""} de vigilance`
            : "Aucun signal sur les lignes retenues",
      detail: input.blockingCount > 0 ? "à acquitter avant tout conseil" : undefined,
      tone: safetySummaryTone(input),
      href: "#zone-securite",
      action: input.blockingCount > 0 ? "Acquitter" : input.attentionCount > 0 ? "Lire" : undefined,
    },
    {
      key: "ordonnance",
      icon: Pill,
      label: "Ordonnance",
      value: `${input.lineCount} médicament${input.lineCount > 1 ? "s" : ""}`,
      detail:
        [
          input.awaitingValidation ? "retenus par la lecture, non validés" : null,
          treatmentDetails.length > 0 ? treatmentDetails.join(" · ") : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      tone: treatmentTone,
      href: "#zone-traitement",
      action: input.awaitingValidation
        ? "Relire"
        : input.unknown > 0
          ? "Rattacher"
          : input.missing > 0
            ? "Voir"
            : undefined,
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
      tone: adviceTone(input),
      // Zone fermée : le geste qui la rouvre est dans la sécurité, pas ici. La
      // ligne conduit là où l'action se trouve, pas là où le problème
      // s'affiche.
      href: input.locked ? "#zone-securite" : "#zone-conseils",
      action: input.locked
        ? "Acquitter d'abord"
        : input.recommendationCount > 0
          ? "Décider"
          : undefined,
    },
  ];
}
