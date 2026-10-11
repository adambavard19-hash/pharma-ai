import type { Metadata } from "next";
import { Target, Trophy } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { loadMyChallenges } from "@/server/services/mobile/home";
import { MCard, Pill, QuietState, ScreenTitle } from "../../_components/ui";
import { ComingSoonCard, SegmentsPreview } from "../../_components/coming-soon";

export const metadata: Metadata = { title: "Challenges" };

/**
 * Challenges, résultats et coach — construit par l'étape « Challenges » du chantier mobile, dans
 * `challenges/_components`. Dès maintenant : les challenges en cours de l'officine ACTIVE (portée de la session), vus
 * depuis la personne connectée. Schéma prêt : PersonalObjective, BonusAuthorization (seules les primes VALIDATED et
 * PAID sont montrées au collaborateur), Recommendation.declineReason, TrainingRecommendation, ClinicalReviewFlag.
 */
export default async function ChallengesPage() {
  const session = await requireUser();

  if (!session.scope) {
    return (
      <div className="space-y-5">
        <ScreenTitle title="Challenges" subtitle="Les challenges d'équipe des officines clientes de PharmaBoost." />
        <QuietState
          icon={<Trophy className="size-6" aria-hidden="true" />}
          title="Réservé aux équipes des officines clientes"
          body="Quand votre titulaire vous invite dans l'équipe de l'officine, vos challenges, vos objectifs et vos résultats apparaissent ici."
          action={
            <a href="/decouvrir" className="inline-flex min-h-11 items-center rounded-[14px] bg-brand-gradient px-5 text-[14.5px] font-semibold text-white">
              Découvrir PharmaBoost
            </a>
          }
        />
      </div>
    );
  }

  const challenges = await loadMyChallenges(session.scope);
  return (
    <div className="space-y-5">
      <ScreenTitle title="Challenges" subtitle={`Les challenges de ${session.activePharmacy?.name ?? "votre officine"}.`} />
      <SegmentsPreview segments={["En cours", "Mes résultats", "Coach"]} />
      {challenges.length === 0 ? (
        <QuietState icon={<Trophy className="size-6" aria-hidden="true" />} title="Aucun challenge en cours" body="Votre titulaire lance les challenges depuis le comptoir PharmaBoost : ils s'affichent ici dès leur ouverture." />
      ) : (
        <div className="space-y-3">
          {challenges.map((challenge) => (
            <MCard key={challenge.id} className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-50 text-accent-700">
                <Trophy className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink-900">{challenge.title}</p>
                <p className="text-[12.5px] text-text-tertiary">
                  {challenge.laboratory} · moi {challenge.myUnits} · équipe {challenge.teamUnits}
                  {challenge.target ? ` / ${challenge.target}` : ""}
                </p>
              </div>
              {challenge.rank && <Pill tone="amber">{challenge.rank === 1 ? "1er" : `${challenge.rank}e`} / {challenge.people}</Pill>}
            </MCard>
          ))}
        </div>
      )}
      <ComingSoonCard
        icon={<Target className="size-6" aria-hidden="true" />}
        title="Vos objectifs et votre coach"
        body="Des objectifs personnels fixés avec votre titulaire, vos primes validées, et un coach qui suggère la bonne formation au bon moment."
        items={["Objectifs personnels de la semaine ou du mois", "Les primes validées par votre titulaire, et elles seules", "Des formations suggérées d'après les chiffres de l'équipe, jamais d'après un patient"]}
      />
    </div>
  );
}
