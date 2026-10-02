"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Pencil, Plus, Trophy } from "lucide-react";
import type { BrandSuggestion, ChallengeRow } from "@/server/services/challenges";
import { sumRewards, type EffectiveStatus } from "@/core/challenges/progress";
import { universeLabel } from "@/config/universes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { SectionHeader } from "@/components/ui/page";
import { formatCents } from "@/lib/format";
import { ChallengeActions } from "./challenge-actions";
import { ChallengeFormModal } from "./challenge-form";
import { COUNT_MODE_SHORT, ChallengeMeter, RewardFigures, StatusBadge, coverageLabel, formatPeriod, timingLabel } from "./challenge-display";

const GROUPS: { status: EffectiveStatus; title: string }[] = [
  { status: "RUNNING", title: "En cours" },
  { status: "UPCOMING", title: "À venir" },
  { status: "ENDED", title: "Terminés" },
  { status: "ARCHIVED", title: "Archivés" },
];

/**
 * Les challenges de l'officine, regroupés par moment : en cours, à venir,
 * terminés, archivés. Chaque carte dit l'essentiel — où l'on en est, ce que
 * c'est déjà rapporté, ce que ça peut rapporter — et mène au détail.
 */
export function ChallengesBoard({ rows, brands, today, sourcesLine }: { rows: ChallengeRow[]; brands: BrandSuggestion[]; today: string; sourcesLine: string }) {
  const [editing, setEditing] = useState<{ challenge: ChallengeRow | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const running = rows.filter((row) => row.progress.effectiveStatus === "RUNNING");
  // Le potentiel total n'est affiché que si chaque challenge rémunéré en a un.
  const totals = sumRewards(running.map((row) => row.progress));
  const archivedCount = rows.filter((row) => row.progress.effectiveStatus === "ARCHIVED").length;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Challenges laboratoires"
        description="Les objectifs que vos laboratoires vous proposent, suivis sur vos ventes réelles. Ils ne sont jamais affichés au comptoir et n'influencent aucun conseil."
        action={
          <Button size="sm" leadingIcon={<Plus className="size-3.5" />} onClick={() => setEditing({ challenge: null })}>
            Nouveau challenge
          </Button>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="size-5" />}
            title="Aucun challenge pour l'instant"
            description="Un laboratoire vous propose un objectif sur une période ? Saisissez-le une fois : PharmaBoost suit vos ventes enregistrées et vous dit où vous en êtes."
            action={
              <Button size="sm" leadingIcon={<Plus className="size-3.5" />} onClick={() => setEditing({ challenge: null })}>
                Créer un challenge
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {running.length > 0 && (
            <p className="text-[13px] text-text-secondary">
              {running.length} challenge{running.length > 1 ? "s" : ""} en cours
              {totals.rewarded > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-text-primary tabular">{formatCents(totals.earnedCents)}</span> réalisés
                  {totals.potentialCents !== null && totals.potentialCents > 0 && (
                    <>
                      {" sur "}
                      <span className="font-medium text-text-primary tabular">{formatCents(totals.potentialCents)}</span> potentiels
                    </>
                  )}
                </>
              )}
            </p>
          )}

          {GROUPS.map((group) => {
            const list = rows.filter((row) => row.progress.effectiveStatus === group.status);
            if (list.length === 0) return null;
            if (group.status === "ARCHIVED" && !showArchived) return null;
            return (
              <section key={group.status} className="space-y-2.5">
                <h3 className="text-[11.5px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">
                  {group.title} · {list.length}
                </h3>
                <div className="grid items-start gap-4 lg:grid-cols-2">
                  {list.map((row) => (
                    <ChallengeCard key={row.id} row={row} onEdit={() => setEditing({ challenge: row })} />
                  ))}
                </div>
              </section>
            );
          })}

          {archivedCount > 0 && (
            <button type="button" onClick={() => setShowArchived((value) => !value)} className="text-[13px] font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline">
              {showArchived ? "Masquer les archivés" : `Voir les archivés (${archivedCount})`}
            </button>
          )}
        </>
      )}

      <p className="text-[12.5px] leading-5 text-text-tertiary">
        Source des données : {sourcesLine}. Les unités viennent des ventes enregistrées dans PharmaBoost pour les produits du challenge, sur sa période, et de vos saisies manuelles. Aucune unité n&apos;est estimée.
      </p>

      <ChallengeFormModal open={editing !== null} onClose={() => setEditing(null)} challenge={editing?.challenge ?? null} brands={brands} today={today} />
    </div>
  );
}

function ChallengeCard({ row, onEdit }: { row: ChallengeRow; onEdit: () => void }) {
  const href = `/parametres/laboratoires/challenges/${row.id}`;
  return (
    <Card className="space-y-3.5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-[11.5px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">
            {row.laboratory}
            {row.universe ? ` · ${universeLabel(row.universe)}` : ""}
          </p>
          <Link href={href} className="block text-[15px] leading-5 font-semibold tracking-[-0.01em] text-text-primary hover:underline">
            {row.title}
          </Link>
          <p className="text-[12.5px] text-text-tertiary">
            {formatPeriod(row.startsOn, row.endsOn)} · {timingLabel(row.progress)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StatusBadge status={row.progress.effectiveStatus} />
          <ChallengeActions id={row.id} title={row.title} status={row.status} effectiveStatus={row.progress.effectiveStatus} />
        </div>
      </div>

      <ChallengeMeter progress={row.progress} />
      <div className="border-t border-border-subtle pt-3">
        <RewardFigures progress={row.progress} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <p className="min-w-0 text-[12px] text-text-tertiary">
          {coverageLabel(row)} · {COUNT_MODE_SHORT[row.countMode]}
          {row.progress.manualUnits !== 0 ? ` · dont ${row.progress.manualUnits} à la main` : ""}
        </p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" leadingIcon={<Pencil className="size-3.5" />} onClick={onEdit}>
            Modifier
          </Button>
          <Button size="sm" variant="outline" trailingIcon={<ArrowRight className="size-3.5" />} asChild>
            <Link href={href}>Détail</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
