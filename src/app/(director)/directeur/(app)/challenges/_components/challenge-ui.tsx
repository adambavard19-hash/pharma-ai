import Link from "next/link";
import { CheckCircle2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/feedback";
import { CHALLENGE_STATE_LABELS, challengePeriodLabel, challengeTimingLabel, describeChallengeGoal, describeReached, describeReward, ordinalFr, type ChallengeMetric, type ChallengeRepProgress, type ChallengeState, type ChallengeTotals } from "@/core/sales/director/challenge";
import { cn } from "@/lib/utils";

/** L'état d'un challenge : en cours, à venir, terminé (ou arrêté à la main). */
export function ChallengeStateBadge({ state, stoppedEarly }: { state: ChallengeState; stoppedEarly: boolean }) {
  const tone = state === "RUNNING" ? "success" : state === "UPCOMING" ? "info" : "neutral";
  return <Badge tone={tone}>{state === "ENDED" && stoppedEarly ? "Arrêté" : CHALLENGE_STATE_LABELS[state]}</Badge>;
}

type CardChallenge = { id: string; title: string; metric: ChallengeMetric; target: number; startsAt: Date; endsAt: Date; isActive: boolean; rewardLabel: string | null; rewardCents: number | null };

/**
 * Un challenge dans la liste : l'objectif, la période, la récompense et, s'il a
 * commencé, la part de l'équipe qui l'a atteint. La carte entière est le lien.
 */
export function ChallengeCard({ challenge, state, stoppedEarly, totals, now }: { challenge: CardChallenge; state: ChallengeState; stoppedEarly: boolean; totals: ChallengeTotals | null; now: Date }) {
  const reward = describeReward(challenge);
  return (
    <li>
      <Link href={`/directeur/challenges/${challenge.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
        <Card interactive className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <div className="min-w-0 space-y-0.5">
              <h3 className="text-[15px] leading-6 font-semibold break-words text-text-primary">{challenge.title}</h3>
              <p className="text-[13px] leading-5 text-text-secondary">
                {describeChallengeGoal(challenge.metric, challenge.target)} par commercial, {challengePeriodLabel(challenge.startsAt, challenge.endsAt)}.
              </p>
            </div>
            {/* La rubrique de la liste dit déjà « en cours », « à venir » ou « terminé » : seul « Arrêté » est une nouvelle information. */}
            {state === "ENDED" && stoppedEarly && <ChallengeStateBadge state={state} stoppedEarly={stoppedEarly} />}
          </div>
          {reward && (
            <p className="flex items-start gap-1.5 text-[13px] text-text-primary">
              <Trophy className="mt-0.5 size-3.5 shrink-0 text-accent-600 dark:text-accent-400" aria-hidden="true" />
              <span className="min-w-0 break-words">{reward}</span>
            </p>
          )}
          {totals && (
            <div className="space-y-1.5">
              <p className="text-[13px] text-text-primary">{describeReached(totals)}</p>
              <Progress value={totals.reachedShare} max={1} tone={totals.reachedShare >= 1 ? "success" : "brand"} label="Part des commerciaux qui ont atteint l'objectif" />
            </div>
          )}
          <p className="text-[12.5px] text-text-tertiary">{challengeTimingLabel(challenge, now)}</p>
        </Card>
      </Link>
    </li>
  );
}

/**
 * L'avancement de chaque commercial, déjà classé : le rang, le nom (qui mène à
 * sa fiche), ce qu'il a réalisé sur son objectif, et une barre. Les chiffres
 * viennent des dossiers : rien ne se saisit ici.
 */
export function RepProgressList({ reps }: { reps: ChallengeRepProgress[] }) {
  return (
    <ol className="divide-y divide-border-subtle">
      {reps.map((rep) => (
        <li key={rep.salesRepId} className="space-y-2 py-3 first:pt-0 last:pb-0">
          <div className="flex items-center gap-3">
            <span className={cn("w-9 shrink-0 text-[13px] font-semibold tabular", rep.rank === null ? "text-text-tertiary" : "text-text-primary")} aria-label={rep.rank === null ? "Pas encore classé" : ordinalFr(rep.rank)}>
              {rep.rank === null ? "—" : ordinalFr(rep.rank)}
            </span>
            <Link href={`/directeur/commerciaux/${rep.salesRepId}`} className="min-w-0 flex-1 truncate text-[14px] font-medium text-text-primary hover:underline">
              {rep.name}
            </Link>
            {rep.reached && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-success-700 dark:text-success-500">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Objectif atteint</span>
              </span>
            )}
            <span className="shrink-0 text-right text-[13px] tabular text-text-secondary">
              <strong className="font-semibold text-text-primary">{rep.value}</strong> / {rep.target}
              <span className="ml-1.5 hidden text-text-tertiary sm:inline">{rep.percent} %</span>
            </span>
          </div>
          <div className="pl-12">
            <Progress value={Math.min(rep.value, rep.target)} max={rep.target} tone={rep.reached ? "success" : "brand"} label={`${rep.name} : ${rep.value} sur ${rep.target}`} />
          </div>
        </li>
      ))}
    </ol>
  );
}
