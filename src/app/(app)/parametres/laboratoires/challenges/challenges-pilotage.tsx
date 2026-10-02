import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
import { listRunningChallengesForPilotage, type ChallengeScope } from "@/server/services/challenges";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/format";
import { ChallengeMeter, formatDay, unitsWord } from "./challenge-display";

/**
 * La section « Challenges laboratoires » du Pilotage.
 *
 * Compacte : les challenges en cours, leur avancement et leur montant, et qui
 * a enregistré les ventes comptées. Elle vit dans le Pilotage (réservé au
 * titulaire) et jamais au comptoir. L'attribution suit la même règle que le
 * reste de l'écran : la vente revient à qui l'a enregistrée, rien n'est
 * reconstitué ; les saisies manuelles ne sont attribuées à personne.
 */
export async function ChallengesPilotageSection({ scope, canOpen }: { scope: ChallengeScope; canOpen: boolean }) {
  const challenges = await listRunningChallengesForPilotage(scope);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-[15px] font-semibold text-text-primary">Challenges laboratoires</h2>
          <p className="text-[12.5px] leading-5 text-text-secondary">
            Les challenges en cours, sur leur propre période — indépendante de celle choisie plus haut. Mesurés sur les ventes enregistrées et vos saisies.
          </p>
        </div>
        {canOpen && (
          <Link href="/parametres/laboratoires/challenges" className="inline-flex items-center gap-1 text-[13px] font-medium text-text-secondary hover:text-text-primary">
            Tous les challenges
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>

      {challenges.length === 0 ? (
        <Card className="flex items-center gap-3 px-4 py-3.5">
          <Trophy className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <p className="text-[13px] text-text-secondary">
            Aucun challenge en cours.
            {canOpen && (
              <>
                {" "}
                <Link href="/parametres/laboratoires/challenges" className="font-medium text-text-primary underline-offset-2 hover:underline">
                  Saisir un challenge
                </Link>
              </>
            )}
          </p>
        </Card>
      ) : (
        <div className="grid items-start gap-3.5 md:grid-cols-2">
          {challenges.map((challenge) => (
            <Card key={challenge.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">{challenge.laboratory}</p>
                  {canOpen ? (
                    <Link href={`/parametres/laboratoires/challenges/${challenge.id}`} className="block truncate text-[14.5px] font-semibold text-text-primary hover:underline">
                      {challenge.title}
                    </Link>
                  ) : (
                    <p className="truncate text-[14.5px] font-semibold text-text-primary">{challenge.title}</p>
                  )}
                </div>
                <p className="shrink-0 text-right text-[12px] text-text-tertiary">
                  {challenge.progress.daysRemaining <= 1 ? "Dernier jour" : `${challenge.progress.daysRemaining} j restants`}
                  <span className="block">jusqu&apos;au {formatDay(challenge.endsOn)}</span>
                </p>
              </div>

              <ChallengeMeter progress={challenge.progress} compact />

              {challenge.progress.rewardMode !== "NONE" && (
                <p className="text-[12.5px] text-text-secondary">
                  <span className="font-semibold tabular text-text-primary">{formatCents(challenge.progress.earnedCents ?? 0)}</span> réalisés
                  {challenge.progress.potentialCents !== null && (
                    <>
                      {" sur "}
                      <span className="font-medium tabular text-text-primary">{formatCents(challenge.progress.potentialCents)}</span> potentiels
                    </>
                  )}
                </p>
              )}

              {(challenge.byCollaborator.length > 0 || challenge.progress.manualUnits !== 0) && (
                <ul className="flex flex-wrap gap-1.5 border-t border-border-subtle pt-3" aria-label="Ventes comptées par collaborateur">
                  {challenge.byCollaborator.map((person) => (
                    <li key={person.key} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-sunken py-0.5 pr-2.5 pl-0.5 text-[12px] text-text-secondary">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-card text-[10px] font-semibold text-text-primary">{person.initials}</span>
                      <span className="truncate">{person.label}</span>
                      <span className="font-semibold tabular text-text-primary">{person.units}</span>
                    </li>
                  ))}
                  {challenge.progress.manualUnits !== 0 && (
                    <li className="inline-flex items-center rounded-full bg-surface-sunken px-2.5 py-0.5 text-[12px] text-text-tertiary">
                      + {challenge.progress.manualUnits} {unitsWord(challenge.progress.manualUnits)} saisie{Math.abs(challenge.progress.manualUnits) > 1 ? "s" : ""} à la main
                    </li>
                  )}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
