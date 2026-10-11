import { Target, Trophy } from "lucide-react";
import { OBJECTIVE_METRIC_LABELS, OBJECTIVE_STATE_LABELS, type ObjectiveMetricCode, type ObjectiveState } from "@/core/personal/objectives";
import { universeLabel } from "@/config/universes";
import type { BoardChallenge, ObjectiveView } from "@/server/services/mobile/personal";
import { MCard, Pill } from "../../../_components/ui";
import { Milestones, ProgressRing, rankLabel, shortDay, StatTile } from "./visuals";

/** Un challenge en cours vu par la personne : l'anneau de l'équipe, ma part, mon rang, les paliers. */
export function ChallengeCard({ challenge }: { challenge: BoardChallenge }) {
  const ratio = challenge.target ? challenge.teamUnits / challenge.target : null;
  const share = challenge.teamUnits > 0 ? Math.round((challenge.myUnits / challenge.teamUnits) * 100) : null;
  return (
    <MCard className="space-y-4">
      <div className="flex items-center gap-4">
        <ProgressRing ratio={ratio} tone="amber" label={ratio === null ? challenge.teamUnits : `${Math.min(999, Math.round(ratio * 100))}%`} caption={ratio === null ? "unités" : "équipe"} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone="amber">{challenge.daysRemaining > 1 ? `Encore ${challenge.daysRemaining} j` : "Dernier jour"}</Pill>
            {challenge.universe && <Pill tone="neutral">{universeLabel(challenge.universe)}</Pill>}
          </div>
          <h3 className="text-[16px] leading-snug font-bold tracking-[-0.01em] text-ink-900">{challenge.title}</h3>
          <p className="text-[12.5px] text-text-tertiary">
            {challenge.laboratory} · jusqu&apos;au {shortDay(challenge.endsOn)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Ma part" value={challenge.myUnits} hint={share !== null ? `${share} % de l'équipe` : "unités"} emphasis />
        <StatTile label="L'équipe" value={challenge.teamUnits} hint={challenge.target ? `sur ${challenge.target}` : "unités"} />
        <StatTile label="Mon rang" value={challenge.myRank ? rankLabel(challenge.myRank) : "—"} hint={challenge.participants > 0 ? `sur ${challenge.participants}` : "à lancer"} />
      </div>
      {challenge.milestones.length > 0 && <Milestones milestones={challenge.milestones} current={challenge.teamUnits} />}
      {challenge.unitsToNextMilestone !== null && challenge.unitsToNextMilestone > 0 && (
        <p className="rounded-xl bg-accent-50 px-3 py-2 text-[12.5px] font-medium text-accent-900">
          Plus que <strong className="tabular">{challenge.unitsToNextMilestone}</strong> unité{challenge.unitsToNextMilestone > 1 ? "s" : ""} pour {challenge.milestones.length > 0 ? "le prochain palier" : "l'objectif"} de l&apos;équipe.
        </p>
      )}
    </MCard>
  );
}

export function EndedChallengeRow({ challenge }: { challenge: BoardChallenge }) {
  const reached = challenge.target !== null && challenge.teamUnits >= challenge.target;
  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
        <Trophy className="size-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold text-ink-900">{challenge.title}</p>
        <p className="text-[12px] text-text-tertiary">
          Terminé le {shortDay(challenge.endsOn)} · équipe {challenge.teamUnits}
          {challenge.target ? ` / ${challenge.target}` : ""} · moi {challenge.myUnits}
        </p>
      </div>
      {reached && <Pill tone="success">Atteint</Pill>}
    </li>
  );
}

const STATE_TONES: Record<ObjectiveState, "brand" | "neutral" | "amber" | "success"> = {
  UPCOMING: "neutral",
  DONE: "success",
  ON_TRACK: "brand",
  BEHIND: "amber",
  MISSED: "neutral",
  MANUAL: "neutral",
};

/** Un objectif personnel : l'anneau, la valeur sur la cible, l'état, la période. */
export function ObjectiveCard({ objective, showOwner = false }: { objective: ObjectiveView; showOwner?: boolean }) {
  const { progress } = objective;
  const tone = progress.state === "DONE" ? "success" : "brand";
  return (
    <MCard className="flex items-center gap-4">
      {progress.percent === null ? (
        <span className="flex size-[64px] shrink-0 items-center justify-center rounded-full bg-ink-50 text-ink-500 ring-8 ring-ink-100 ring-inset">
          <Target className="size-6" aria-hidden="true" />
        </span>
      ) : (
        <ProgressRing ratio={progress.percent / 100} size={64} stroke={7} tone={tone} label={`${progress.percent}%`} />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={STATE_TONES[progress.state]}>{OBJECTIVE_STATE_LABELS[progress.state]}</Pill>
          {showOwner && <span className="truncate text-[12px] font-semibold text-ink-600">{objective.userName}</span>}
        </div>
        <p className="text-[15px] leading-snug font-semibold text-ink-900">{objective.title}</p>
        <p className="text-[12.5px] text-text-tertiary">
          {OBJECTIVE_METRIC_LABELS[objective.metric as ObjectiveMetricCode] ?? objective.metric}
          {progress.value !== null && (
            <>
              {" · "}
              <strong className="font-semibold text-ink-800 tabular">{progress.value}</strong> / {progress.target}
            </>
          )}
          {progress.value === null && ` · cible ${progress.target}`}
          {" · "}
          {progress.daysRemaining > 0 ? `jusqu'au ${shortDay(objective.endsOn)}` : `terminé le ${shortDay(objective.endsOn)}`}
          {objective.challengeTitle && ` · ${objective.challengeTitle}`}
        </p>
      </div>
    </MCard>
  );
}
