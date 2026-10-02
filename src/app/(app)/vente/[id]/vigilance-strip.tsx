"use client";

import { useState } from "react";
import { Baby, Heart, Hourglass, Milk, ShieldAlert, ShieldCheck, Wind, Zap, type LucideIcon } from "lucide-react";
import { VIGILANCE_LEVEL_LABELS, populationLabel, type SuggestionVigilance } from "@/config/vigilances";
import { cn } from "@/lib/utils";

/**
 * Les vigilances patient d'une proposition, lisibles d'un coup d'œil.
 *
 * Toujours une icône ET un libellé (le survol ne marche pas sur un écran
 * tactile) ; un clic déplie la raison et sa source. Rien ne s'affiche quand le
 * patient n'est pas concerné : le moteur n'envoie que ce qui compte ici.
 */

const ICONS: Record<string, LucideIcon> = {
  PREGNANCY: Heart,
  BREASTFEEDING: Milk,
  ASTHMA: Wind,
  EPILEPSY: Zap,
  CHILD: Baby,
};

const TONES: Record<SuggestionVigilance["level"], string> = {
  CONTRAINDICATION: "border-danger-300 bg-danger-50 text-danger-800 dark:border-danger-800 dark:bg-danger-950/40 dark:text-danger-300",
  PHARMACIST_VALIDATION: "border-danger-200 bg-surface-card text-danger-800 dark:border-danger-900 dark:text-danger-300",
  CAUTION: "border-warning-200 bg-warning-50 text-warning-800 dark:border-warning-900 dark:bg-warning-950/30 dark:text-warning-400",
  INFO: "border-border-default bg-surface-sunken text-text-secondary",
};

function stateLabel(vigilance: SuggestionVigilance): string {
  if (vigilance.status === null) return "à vérifier";
  return VIGILANCE_LEVEL_LABELS[vigilance.level].toLowerCase();
}

export function VigilanceStrip({ vigilances, canVerify }: { vigilances: SuggestionVigilance[]; canVerify: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (vigilances.length === 0) return null;
  const selected = vigilances.find((v) => v.population === open) ?? null;
  const needsPharmacist = vigilances.some((v) => v.level === "PHARMACIST_VALIDATION" || v.level === "CONTRAINDICATION");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label="Vigilances patient">
        {vigilances.map((vigilance) => {
          const Icon = ICONS[vigilance.population] ?? ShieldAlert;
          const active = open === vigilance.population;
          return (
            <button
              key={vigilance.population}
              type="button"
              role="listitem"
              onClick={() => setOpen(active ? null : vigilance.population)}
              aria-expanded={active}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-shadow", TONES[vigilance.level], active && "ring-2 ring-offset-1 ring-current/20")}
            >
              <Icon className="size-3.5 shrink-0" />
              {populationLabel(vigilance.population)}
              <span className="font-normal opacity-80">· {stateLabel(vigilance)}</span>
            </button>
          );
        })}
        {needsPharmacist && (
          <span className={cn("inline-flex items-center gap-1 text-[12px]", canVerify ? "text-text-tertiary" : "font-medium text-danger-700 dark:text-danger-400")}>
            <ShieldCheck className="size-3.5" />
            {canVerify ? "Validation pharmacien" : "Validation pharmacien requise"}
          </span>
        )}
      </div>
      {selected && (
        <div className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2.5 text-[13px] leading-5 text-text-primary">
          <p>{selected.text}</p>
          {selected.status === null && (
            <p className="mt-1 text-text-secondary">Le patient n&apos;est pas connu ici : vérifiez avec lui avant de proposer.</p>
          )}
          {selected.sources.length > 0 && <p className="mt-1 text-[12px] text-text-tertiary">Source : {selected.sources.join(" · ")}</p>}
        </div>
      )}
    </div>
  );
}

/** « Date courte : N j » — une information discrète à côté du stock, jamais un argument. */
export function ShortDateBadge({ shortDate }: { shortDate: { daysLeft: number; level: "SOON" | "URGENT" } | null }) {
  if (!shortDate) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-medium",
        shortDate.level === "URGENT"
          ? "bg-warning-100 text-warning-800 dark:bg-warning-900/40 dark:text-warning-400"
          : "bg-surface-sunken text-text-secondary",
      )}
      title="Lot le plus proche de sa date de péremption"
    >
      <Hourglass className="size-3.5" />
      Date courte : {shortDate.daysLeft} j
    </span>
  );
}
