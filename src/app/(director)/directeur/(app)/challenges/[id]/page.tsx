import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { getChallengeDetail } from "@/server/services/sales/challenges";
import { CHALLENGE_METRIC_HELP, CHALLENGE_METRIC_LABELS, challengePeriodLabel, challengeTimingLabel, challengeToForm, describeChallengeGoal, describeReached, describeReward, lockedFieldsFor, type ChallengeState } from "@/core/sales/director/challenge";
import { PageHeader } from "@/components/ui/page";
import { EmptyState, Progress } from "@/components/ui/feedback";
import { AdminSection, FactList } from "@/components/admin/page-header";
import { formatCents, formatDateLong } from "@/lib/format";
import { ChallengeForm } from "../_components/challenge-form";
import { ChallengeStateBadge, RepProgressList } from "../_components/challenge-ui";
import { DeleteChallengeButton, EndChallengeButton } from "./challenge-actions";

export const metadata: Metadata = { title: "Challenge" };

/** Ce que l'on dit au-dessus du formulaire quand certains champs ne bougent plus. */
function editNotice(state: ChallengeState): string | null {
  if (state === "RUNNING") return "Le challenge a commencé : ce qu'il compte et son premier jour ne se modifient plus. Le reste, si.";
  if (state === "ENDED") return "Le challenge est terminé : seuls le titre, le mot pour l'équipe et la récompense se modifient.";
  return null;
}

/**
 * Un challenge : ce qu'il demande, où en est chaque commercial (déjà classé),
 * et de quoi le modifier, le terminer ou le supprimer. L'avancement vient des
 * dossiers réels, jamais d'une saisie.
 */
export default async function DirectorChallengePage({ params }: { params: Promise<{ id: string }> }) {
  await requireDirectorSession();
  const { id } = await params;
  const now = new Date();
  const detail = await getChallengeDetail(id, now);
  if (!detail) notFound();

  const { challenge, state, stoppedEarly, progress } = detail;
  const reward = describeReward(challenge);

  return (
    <div className="space-y-6">
      <PageHeader
        title={challenge.title}
        description={challenge.description ?? undefined}
        breadcrumb={
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/directeur/challenges" className="inline-flex items-center gap-1 text-[12.5px] text-text-tertiary hover:text-text-primary">
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              Tous les challenges
            </Link>
            <ChallengeStateBadge state={state} stoppedEarly={stoppedEarly} />
          </div>
        }
        actions={
          <>
            {state === "RUNNING" && <EndChallengeButton id={challenge.id} />}
            <DeleteChallengeButton id={challenge.id} title={challenge.title} />
          </>
        }
      />

      <AdminSection title="Le défi">
        <FactList
          items={[
            { label: "Ce qui est compté", value: CHALLENGE_METRIC_LABELS[challenge.metric], hint: CHALLENGE_METRIC_HELP[challenge.metric] },
            { label: "Objectif de chaque commercial", value: describeChallengeGoal(challenge.metric, challenge.target) },
            { label: "Période", value: challengePeriodLabel(challenge.startsAt, challenge.endsAt), hint: challengeTimingLabel(challenge, now) },
            { label: "Récompense", value: reward ?? <span className="text-text-tertiary">Aucune</span>, hint: challenge.rewardCents ? `Montant : ${formatCents(challenge.rewardCents)}` : undefined },
            { label: "Lancé par", value: `${challenge.createdByLabel}, le ${formatDateLong(challenge.createdAt)}` },
          ]}
        />
      </AdminSection>

      <AdminSection title="Avancement et classement" description={state === "UPCOMING" ? "Le challenge n'a pas commencé : les chiffres apparaîtront dès le premier jour." : "Compté sur les dossiers de chaque commercial. Les ex æquo partagent leur rang."}>
        {progress.reps.length === 0 ? (
          <EmptyState title="Aucun commercial actif" description="Ajoutez des commerciaux pour qu'ils participent à ce challenge." action={<Link href="/directeur/commerciaux" className="text-[13px] font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Voir les commerciaux</Link>} />
        ) : (
          <div className="space-y-5">
            {state !== "UPCOMING" && (
              <div className="space-y-1.5">
                <p className="text-[14px] font-medium text-text-primary">{describeReached(progress.totals)}</p>
                <Progress value={progress.totals.reachedShare} max={1} tone={progress.totals.reachedShare >= 1 ? "success" : "brand"} label="Part des commerciaux qui ont atteint l'objectif" />
                <p className="text-[12.5px] text-text-tertiary">
                  À eux tous : {progress.totals.totalValue} sur {progress.totals.totalTarget} visés.
                </p>
              </div>
            )}
            <RepProgressList reps={progress.reps} />
          </div>
        )}
      </AdminSection>

      <AdminSection title="Modifier le challenge" className="max-w-3xl">
        <ChallengeForm key={challenge.updatedAt.toISOString()} mode="edit" challengeId={challenge.id} initial={challengeToForm(challenge)} locked={lockedFieldsFor(state)} notice={editNotice(state)} />
      </AdminSection>
    </div>
  );
}
