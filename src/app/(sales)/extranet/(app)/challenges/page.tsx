import type { Metadata } from "next";
import { CheckCircle2, Trophy } from "lucide-react";
import { requireSalesSession } from "@/server/auth/sales-session";
import { challengesOfRep, type RepChallengeRow } from "@/server/services/sales/challenges";
import { challengePeriodLabel, challengeTimingLabel, describeChallengeGoal, describeReward, ordinalFr } from "@/core/sales/director/challenge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: { absolute: "Mes challenges — PharmaBoost" } };

const MAX_RANKING_LINES = 10;

const timing = (row: RepChallengeRow, now: Date) => challengeTimingLabel({ isActive: !row.stoppedEarly, startsAt: row.challenge.startsAt, endsAt: row.challenge.endsAt }, now);

function Reward({ row }: { row: RepChallengeRow }) {
  const reward = describeReward(row.challenge);
  if (!reward) return null;
  return (
    <p className="flex items-start gap-1.5 text-[13.5px] text-text-primary">
      <Trophy className="mt-0.5 size-4 shrink-0 text-accent-600 dark:text-accent-400" aria-hidden="true" />
      <span className="min-w-0 break-words">{reward}</span>
    </p>
  );
}

/** Le classement : le rang, le prénom et l'initiale du nom, le résultat. Rien d'autre sur les autres commerciaux. */
function Ranking({ row }: { row: RepChallengeRow }) {
  if (row.ranking.length === 0) return <p className="text-[13px] text-text-secondary">Le classement apparaît dès le premier résultat de l&apos;équipe.</p>;
  const shown = row.ranking.slice(0, MAX_RANKING_LINES);
  const me = row.ranking.find((line) => line.isMe);
  const lines = me && !shown.includes(me) ? [...shown, me] : shown;
  return (
    <ol className="divide-y divide-border-subtle rounded-lg border border-border-subtle" aria-label="Classement">
      {lines.map((line, index) => (
        <li key={`${line.rank}-${line.name}-${index}`} className={cn("flex items-center gap-3 px-3 py-2 text-[13.5px]", line.isMe && "bg-brand-50 font-medium dark:bg-brand-950")}>
          <span className="w-9 shrink-0 font-semibold tabular text-text-primary">{ordinalFr(line.rank)}</span>
          <span className="min-w-0 flex-1 truncate text-text-primary">
            {line.name}
            {line.isMe && <span className="ml-1.5 text-[12px] font-normal text-brand-700 dark:text-brand-400">(vous)</span>}
          </span>
          <span className="shrink-0 tabular text-text-secondary">{line.value}</span>
        </li>
      ))}
    </ol>
  );
}

function RunningCard({ row, now }: { row: RepChallengeRow; now: Date }) {
  const { challenge, mine } = row;
  const missing = mine ? Math.max(0, mine.target - mine.value) : 0;
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-[17px] leading-6 font-semibold break-words text-text-primary">{challenge.title}</h2>
            <p className="text-[13.5px] leading-5 text-text-secondary">
              Objectif : {describeChallengeGoal(challenge.metric, challenge.target)}, {challengePeriodLabel(challenge.startsAt, challenge.endsAt)}.
            </p>
          </div>
          <Badge tone="success">{timing(row, now)}</Badge>
        </div>
        {challenge.description && <p className="text-[13.5px] leading-5 break-words text-text-secondary">{challenge.description}</p>}
        <Reward row={row} />

        {mine ? (
          <div className="space-y-2 rounded-xl bg-surface-sunken p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-medium text-text-secondary">Votre avancement</p>
              <p className="text-[22px] leading-none font-semibold tabular text-text-primary">
                {mine.value} <span className="text-[15px] font-normal text-text-tertiary">/ {mine.target}</span>
              </p>
            </div>
            <Progress value={Math.min(mine.value, mine.target)} max={mine.target} tone={mine.reached ? "success" : "brand"} label={`${mine.value} sur ${mine.target}`} />
            {mine.reached ? (
              <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-success-700 dark:text-success-500">
                <CheckCircle2 className="size-4" aria-hidden="true" /> Objectif atteint.
              </p>
            ) : (
              <p className="text-[13.5px] text-text-primary">Il vous manque {describeChallengeGoal(challenge.metric, missing)}.</p>
            )}
            <p className="text-[13px] text-text-secondary">{mine.rank ? `Vous êtes ${ordinalFr(mine.rank)} sur ${row.participants}.` : "Pas encore classé : le rang apparaît dès votre premier résultat."}</p>
          </div>
        ) : (
          <p className="text-[13.5px] text-text-secondary">Vous ne participez pas à ce challenge.</p>
        )}

        <div className="space-y-2">
          <h3 className="text-[13px] font-semibold text-text-primary">Classement</h3>
          <Ranking row={row} />
        </div>
      </CardContent>
    </Card>
  );
}

function UpcomingCard({ row, now }: { row: RepChallengeRow; now: Date }) {
  const { challenge } = row;
  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <h3 className="min-w-0 text-[15px] leading-6 font-semibold break-words text-text-primary">{challenge.title}</h3>
          <Badge tone="info">{timing(row, now)}</Badge>
        </div>
        <p className="text-[13.5px] leading-5 text-text-secondary">
          Objectif : {describeChallengeGoal(challenge.metric, challenge.target)}, {challengePeriodLabel(challenge.startsAt, challenge.endsAt)}.
        </p>
        <Reward row={row} />
      </CardContent>
    </Card>
  );
}

function EndedLine({ row }: { row: RepChallengeRow }) {
  const { challenge, mine } = row;
  return (
    <li className="space-y-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-[14px] font-medium break-words text-text-primary">{challenge.title}</p>
        {mine ? <Badge tone={mine.reached ? "success" : "neutral"}>{mine.reached ? "Objectif atteint" : "Objectif non atteint"}</Badge> : <Badge tone="neutral">Non participant</Badge>}
      </div>
      <p className="text-[12.5px] leading-5 text-text-secondary">
        {challengePeriodLabel(challenge.startsAt, challenge.endsAt)} · {describeChallengeGoal(challenge.metric, challenge.target)}
        {mine && (
          <>
            {" · "}vous : {mine.value} / {mine.target}
            {mine.rank ? `, ${ordinalFr(mine.rank)} sur ${row.participants}` : ""}
          </>
        )}
      </p>
    </li>
  );
}

/**
 * « Mes challenges », en lecture seule : les objectifs lancés par la direction
 * commerciale, mon avancement et mon rang. Des autres commerciaux, seulement le
 * classement (prénom et initiale du nom). L'avancement se compte sur mes
 * dossiers : je n'ai rien à saisir.
 */
export default async function SalesChallengesPage() {
  const session = await requireSalesSession();
  const now = new Date();
  const { running, upcoming, ended } = await challengesOfRep(session.rep.id, now);

  return (
    <>
      <div>
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-text-primary">Mes challenges</h1>
        <p className="mt-1 text-[13.5px] text-text-secondary">Votre avancement se calcule tout seul, à partir de vos dossiers.</p>
      </div>

      {running.length === 0 && upcoming.length === 0 && ended.length === 0 && (
        <Card>
          <CardContent className="py-6">
            <p className="text-[13.5px] text-text-secondary">Aucun challenge pour l&apos;instant. Ils apparaîtront ici dès qu&apos;un challenge sera lancé.</p>
          </CardContent>
        </Card>
      )}

      {running.length > 0 && (
        <section aria-label="Challenges en cours" className="space-y-4">
          {running.map((row) => (
            <RunningCard key={row.challenge.id} row={row} now={now} />
          ))}
        </section>
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="challenges-a-venir" className="space-y-3">
          <h2 id="challenges-a-venir" className="text-[15px] font-semibold text-text-primary">À venir</h2>
          {upcoming.map((row) => (
            <UpcomingCard key={row.challenge.id} row={row} now={now} />
          ))}
        </section>
      )}

      {ended.length > 0 && (
        <section aria-labelledby="challenges-termines" className="space-y-3">
          <h2 id="challenges-termines" className="text-[15px] font-semibold text-text-primary">Terminés</h2>
          <Card>
            <CardContent className="py-4">
              <ul className="divide-y divide-border-subtle">
                {ended.map((row) => (
                  <EndedLine key={row.challenge.id} row={row} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </>
  );
}
