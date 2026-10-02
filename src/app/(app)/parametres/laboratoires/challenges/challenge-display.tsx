import { Check, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/feedback";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EFFECTIVE_STATUS_LABELS, progressPercent, type ChallengeProgress, type EffectiveStatus } from "@/core/challenges/progress";
import type { ChallengeTier } from "@/core/challenges/terms";

/**
 * Briques d'affichage des challenges, partagées par la liste, le détail, le
 * Pilotage et la console : sans état ni effet, utilisables côté serveur comme
 * côté client. Les chiffres viennent tous de `computeChallengeProgress`.
 */

const SHORT_DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const LONG_DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** « 12 oct. 2026 » à partir d'un jour « AAAA-MM-JJ ». */
export function formatDay(day: string): string {
  return LONG_DAY.format(asDate(day));
}

/** « 1 oct. → 31 déc. 2026 », l'année répétée seulement si elle change. */
export function formatPeriod(startsOn: string, endsOn: string): string {
  const sameYear = startsOn.slice(0, 4) === endsOn.slice(0, 4);
  return `${sameYear ? SHORT_DAY.format(asDate(startsOn)) : LONG_DAY.format(asDate(startsOn))} → ${LONG_DAY.format(asDate(endsOn))}`;
}

export function timingLabel(progress: Pick<ChallengeProgress, "effectiveStatus" | "daysRemaining" | "daysUntilStart">): string {
  switch (progress.effectiveStatus) {
    case "UPCOMING":
      return progress.daysUntilStart <= 1 ? "Commence demain" : `Commence dans ${progress.daysUntilStart} jours`;
    case "RUNNING":
      return progress.daysRemaining <= 1 ? "Dernier jour" : `${progress.daysRemaining} jours restants`;
    case "ENDED":
      return "Terminé";
    case "ARCHIVED":
      return "Archivé";
  }
}

const STATUS_TONES: Record<EffectiveStatus, "brand" | "info" | "neutral"> = {
  RUNNING: "brand",
  UPCOMING: "info",
  ENDED: "neutral",
  ARCHIVED: "neutral",
};

export function StatusBadge({ status }: { status: EffectiveStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{EFFECTIVE_STATUS_LABELS[status]}</Badge>;
}

export function unitsWord(count: number): string {
  return Math.abs(count) > 1 ? "unités" : "unité";
}

/** Unités / objectif, pourcentage et barre. Sans objectif : les unités seules, et on le dit. */
export function ChallengeMeter({
  progress,
  compact = false,
}: {
  progress: Pick<ChallengeProgress, "units" | "target" | "ratio" | "targetIsImplicit">;
  compact?: boolean;
}) {
  const percent = progressPercent(progress);
  const reached = progress.ratio !== null && progress.ratio >= 1;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="tabular text-text-primary">
          <span className={cn("font-semibold", compact ? "text-[17px]" : "text-[22px] leading-7")}>{progress.units}</span>
          <span className="text-[13px] text-text-secondary">
            {progress.target !== null ? ` / ${progress.target} ${unitsWord(progress.target)}` : ` ${unitsWord(progress.units)}`}
            {progress.targetIsImplicit ? " (dernier palier)" : ""}
          </span>
        </p>
        {percent !== null && (
          <span className="flex items-center gap-1.5">
            {reached && (
              <Badge tone="success" icon={<Check className="size-3" />}>
                Objectif atteint
              </Badge>
            )}
            <span className="text-[13px] font-semibold tabular text-text-primary">{percent} %</span>
          </span>
        )}
      </div>
      {progress.ratio !== null ? (
        <Progress value={Math.min(1, progress.ratio)} max={1} tone={reached ? "success" : "brand"} label="Progression vers l'objectif" />
      ) : (
        <p className="text-[12px] text-text-tertiary">Sans objectif chiffré.</p>
      )}
    </div>
  );
}

/** Réalisé et potentiel. Sans prime saisie, aucun montant : on ne fabrique pas de chiffre. */
export function RewardFigures({
  progress,
}: {
  progress: Pick<ChallengeProgress, "rewardMode" | "earnedCents" | "potentialCents" | "nextTier" | "unitsToNextTier" | "reachedTier">;
}) {
  if (progress.rewardMode === "NONE") {
    return <p className="text-[12.5px] text-text-tertiary">Aucune prime saisie pour ce challenge.</p>;
  }
  return (
    <div className="space-y-1.5">
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Réalisé</dt>
          <dd className="text-[16px] font-semibold tabular text-text-primary">{formatCents(progress.earnedCents ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Potentiel</dt>
          <dd className="text-[16px] font-semibold tabular text-text-secondary">
            {progress.potentialCents === null ? "—" : formatCents(progress.potentialCents)}
          </dd>
        </div>
      </dl>
      {progress.rewardMode === "TIERS" && (
        <p className="text-[12px] text-text-tertiary">
          {progress.nextTier && progress.unitsToNextTier !== null
            ? `Encore ${progress.unitsToNextTier} ${unitsWord(progress.unitsToNextTier)} pour le palier à ${formatCents(progress.nextTier.bonusCents)}.`
            : "Dernier palier atteint."}
        </p>
      )}
      {progress.rewardMode === "PER_UNIT" && progress.potentialCents === null && (
        <p className="text-[12px] text-text-tertiary">Potentiel : fixez un objectif pour le connaître.</p>
      )}
    </div>
  );
}

/** La grille des paliers, celui atteint coché. */
export function TierList({ tiers, units }: { tiers: ChallengeTier[]; units: number }) {
  return (
    <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
      {tiers.map((tier) => {
        const reached = units >= tier.units;
        return (
          <li key={tier.units} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
            <span className="flex items-center gap-2 text-text-primary">
              {reached ? <Check className="size-4 text-text-primary" aria-label="atteint" /> : <Trophy className="size-4 text-text-tertiary" aria-hidden="true" />}
              À partir de <span className="font-semibold tabular">{tier.units}</span> {unitsWord(tier.units)}
            </span>
            <span className={cn("font-semibold tabular", reached ? "text-text-primary" : "text-text-secondary")}>{formatCents(tier.bonusCents)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export const COUNT_MODE_SHORT: Record<"ALL_SALES" | "ATTRIBUTED", string> = {
  ALL_SALES: "toutes les ventes enregistrées",
  ATTRIBUTED: "ventes issues d'un conseil",
};

export function coverageLabel(row: { productIds: string[]; brandLabel: string | null; laboratory: string; coveredProducts: number }): string {
  if (row.productIds.length > 0) return `${row.productIds.length} produit${row.productIds.length > 1 ? "s" : ""} choisi${row.productIds.length > 1 ? "s" : ""}`;
  return `Toute la marque ${row.brandLabel ?? row.laboratory} · ${row.coveredProducts} référence${row.coveredProducts > 1 ? "s" : ""}`;
}
