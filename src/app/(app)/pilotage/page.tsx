import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { resolvePeriod, type FixedPeriodKey } from "@/core/analytics/periods";
import { loadTeamChallenges, loadTeamRanking } from "@/server/services/team-ranking";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mon équipe" };

const PERIODS: { key: FixedPeriodKey; label: string; param: string }[] = [
  { key: "today", label: "Aujourd'hui", param: "jour" },
  { key: "week", label: "Cette semaine", param: "semaine" },
  { key: "month", label: "Ce mois", param: "mois" },
  { key: "year", label: "Cette année", param: "annee" },
];

/**
 * « Mon équipe » : le centre de pilotage du titulaire, volontairement simple.
 *
 * Pour chaque collaborateur : combien de conseils lui ont été proposés, combien ont été validés, son rang — pour aujourd'hui, la
 * semaine, le mois ou l'année — et où il en est dans les challenges en cours. Les chiffres viennent de la base : ils s'accumulent
 * tout seuls, sans rien à saisir. Le détail des ventes et du chiffre d'affaires est dans « Ce que PharmaBoost vous rapporte ».
 * Réservé au titulaire : ces chiffres n'ont rien à faire sous les yeux du comptoir.
 */
export default async function PilotagePage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const session = await requirePermission(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
  const { periode } = await searchParams;
  const chosen = PERIODS.find((period) => period.param === periode) ?? PERIODS[0];
  const range = resolvePeriod(chosen.key);

  const [ranking, challenges] = await Promise.all([loadTeamRanking(session.scope, range), loadTeamChallenges(session.scope)]);
  const { rows, totals } = ranking;
  const nobody = totals.proposed === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Mon équipe" description="Les conseils proposés et validés par chacun, et où il en est dans les challenges. Ces chiffres ne sont visibles que de vous." />

      <nav aria-label="Période" className="flex flex-wrap gap-1.5">
        {PERIODS.map((period) => (
          <Link
            key={period.key}
            href={`/pilotage?periode=${period.param}`}
            aria-current={period.key === chosen.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-2 text-[14px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none",
              period.key === chosen.key ? "border-brand-600 bg-brand-600 text-white" : "border-border-default bg-surface-card text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
            )}
          >
            {period.label}
          </Link>
        ))}
      </nav>

      <section aria-labelledby="classement" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="classement" className="text-[18px] font-semibold text-text-primary">
            Classement
          </h2>
          <p className="text-[14px] text-text-secondary">
            {nobody ? "Aucun conseil proposé sur cette période." : `${totals.proposed} conseil${totals.proposed > 1 ? "s" : ""} proposé${totals.proposed > 1 ? "s" : ""} · ${totals.validated} validé${totals.validated > 1 ? "s" : ""}${totals.rate !== null ? ` (${formatPercent(totals.rate)})` : ""}`}
          </p>
        </div>

        {rows.length === 0 ? (
          <Card>
            <EmptyState title="Pas encore d'équipe" description="Ajoutez vos collaborateurs dans « Équipe » : leur classement apparaîtra ici." />
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ol className="divide-y divide-border-subtle">
                {rows.map((row) => {
                  const unassigned = row.userId === null;
                  const share = totals.validated > 0 ? Math.round((row.validated / totals.validated) * 100) : 0;
                  return (
                    <li key={row.userId ?? "non-attribue"} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-5">
                      <span
                        aria-label={unassigned ? undefined : `Rang ${row.rank}`}
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold tabular",
                          unassigned ? "bg-surface-sunken text-text-tertiary" : row.rank === 1 && row.validated > 0 ? "bg-warning-100 text-warning-800 dark:bg-warning-900/50 dark:text-warning-300" : "bg-surface-sunken text-text-secondary",
                        )}
                      >
                        {unassigned ? "–" : row.rank}
                      </span>
                      <span className="min-w-0 flex-1 basis-40">
                        <span className="block truncate text-[16px] font-semibold text-text-primary">{row.name}</span>
                        {unassigned && <span className="block text-[12.5px] text-text-secondary">Ventes d&apos;un comptoir qui n&apos;était attribué à personne. Attribuez-le dans « Mes comptoirs ».</span>}
                        {!unassigned && <span className="mt-1 block h-1.5 max-w-xs overflow-hidden rounded-full bg-surface-sunken" aria-hidden><span className="block h-full rounded-full bg-brand-500" style={{ width: `${share}%` }} /></span>}
                      </span>
                      <dl className="flex shrink-0 gap-6 text-right">
                        <div>
                          <dd className="text-[22px] leading-7 font-semibold tabular text-text-primary">{row.proposed}</dd>
                          <dt className="text-[12px] text-text-secondary">proposés</dt>
                        </div>
                        <div>
                          <dd className="text-[22px] leading-7 font-semibold tabular text-success-700 dark:text-success-400">{row.validated}</dd>
                          <dt className="text-[12px] text-text-secondary">validés</dt>
                        </div>
                        <div className="w-14">
                          <dd className="text-[22px] leading-7 font-semibold tabular text-text-primary">{row.rate === null ? "—" : formatPercent(row.rate)}</dd>
                          <dt className="text-[12px] text-text-secondary">taux</dt>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        )}
      </section>

      <section aria-labelledby="challenges" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="challenges" className="text-[18px] font-semibold text-text-primary">
            Challenges en cours
          </h2>
          <Link href="/parametres/laboratoires/challenges" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-text-secondary hover:text-text-primary">
            Gérer les challenges
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        {challenges.length === 0 ? (
          <Card className="flex items-center gap-3 px-4 py-4">
            <Trophy className="size-5 shrink-0 text-text-tertiary" aria-hidden />
            <p className="text-[14px] text-text-secondary">Aucun challenge en cours.</p>
          </Card>
        ) : (
          <div className="grid items-start gap-4 md:grid-cols-2">
            {challenges.map((challenge) => {
              const ratio = challenge.target ? Math.min(1, challenge.units / challenge.target) : null;
              return (
                <Card key={challenge.id} className="space-y-4 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[11.5px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">{challenge.laboratory}</p>
                      <p className="truncate text-[16px] font-semibold text-text-primary">{challenge.title}</p>
                    </div>
                    <p className="shrink-0 text-right text-[12.5px] text-text-secondary">{challenge.daysRemaining <= 1 ? "Dernier jour" : `${challenge.daysRemaining} jours restants`}</p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[14px] text-text-secondary">
                      <span className="text-[22px] font-semibold tabular text-text-primary">{challenge.units}</span>
                      {challenge.target ? ` sur ${challenge.target} unités` : " unités vendues"}
                    </p>
                    {ratio !== null && (
                      <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Avancement de ${challenge.title}`}>
                        <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.round(ratio * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  {challenge.people.length > 0 ? (
                    <ol className="space-y-1.5">
                      {challenge.people.map((person, index) => (
                        <li key={person.userId} className="flex items-center gap-3 text-[14px]">
                          <span className="w-5 text-right text-[13px] text-text-tertiary tabular">{index + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-text-primary">{person.name}</span>
                          <span className="shrink-0 font-semibold tabular text-text-primary">{person.units}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-[13px] text-text-secondary">Personne n&apos;a encore vendu de produit de ce challenge.</p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-[13.5px] text-text-secondary">
        Les ventes, le chiffre d&apos;affaires et les produits les plus conseillés sont dans{" "}
        <Link href="/resultats?periode=month" className="inline-flex items-center gap-1 font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
          Ce que PharmaBoost vous rapporte
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
        .
      </p>
    </div>
  );
}
