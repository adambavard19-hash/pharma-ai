import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, Compass, Target, Trophy, Users } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { loadChallengeBoard, loadMyObjectives } from "@/server/services/mobile/personal";
import { canManageTeam } from "@/core/personal/bonuses";
import { MCard, QuietState, ScreenTitle, SectionTitle } from "../../_components/ui";
import { ChallengeCard, EndedChallengeRow, ObjectiveCard } from "./_components/cards";

export const metadata: Metadata = { title: "Challenges" };

/**
 * Challenges : les challenges de l'officine ACTIVE vus depuis la personne connectée (sa part, son rang, l'avancée de
 * l'équipe), ses objectifs personnels, et les challenges terminés. Tout part de la portée de la session. Le titulaire a
 * en plus l'accès à « Mon équipe » (objectifs et primes).
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
          body="Quand votre titulaire vous invite dans l'équipe de l'officine, vos challenges, vos objectifs et vos résultats apparaissent ici. Vos formations, elles, restent les vôtres."
        />
        <a
          href="/decouvrir"
          className="group relative block overflow-hidden rounded-[24px] border border-brand-100 bg-white p-5 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)] transition-transform active:scale-[0.985]"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -bottom-10 size-40 rounded-full bg-brand-100/70 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-white">
              <Compass className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[16px] font-bold tracking-[-0.02em] text-ink-900">Découvrir l&apos;offre PharmaBoost</p>
              <p className="text-[13.5px] leading-5 text-text-secondary">Le bon conseil au comptoir, au scan de l&apos;ordonnance — et des challenges d&apos;équipe mesurés sur des ventes réelles.</p>
            </div>
            <ArrowUpRight className="size-5 shrink-0 text-brand-700" aria-hidden="true" />
          </div>
        </a>
      </div>
    );
  }

  const [board, objectives] = await Promise.all([loadChallengeBoard(session.scope), loadMyObjectives(session.scope)]);
  const owner = canManageTeam(session.role);
  const currentObjectives = objectives.filter((objective) => objective.progress.daysRemaining > 0);

  return (
    <div className="space-y-7">
      <ScreenTitle title="Challenges" subtitle={`${session.activePharmacy?.name ?? "Votre officine"} · vos challenges et vos objectifs.`} />

      {owner && (
        <Link
          href="/m/challenges/equipe"
          className="m-rise flex min-h-16 items-center gap-3.5 rounded-[20px] bg-[linear-gradient(135deg,oklch(0.44_0.075_188),oklch(0.55_0.095_172))] px-4 py-3.5 text-white shadow-[0_14px_30px_-16px_oklch(0.42_0.08_180/0.9)] transition-transform active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-bold">Mon équipe</span>
            <span className="block text-[12.5px] text-white/80">Résultats du mois, objectifs, primes à valider</span>
          </span>
          <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
        </Link>
      )}

      <section className="m-rise space-y-3" style={{ animationDelay: "40ms" }} aria-labelledby="en-cours">
        <SectionTitle title={<span id="en-cours">En cours</span>} />
        {board.running.length > 0 ? (
          <div className={board.running.length > 1 ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
            {board.running.map((challenge) => (
              <ChallengeCard key={challenge.id} challenge={challenge} />
            ))}
          </div>
        ) : (
          <QuietState
            compact
            icon={<Trophy className="size-6" aria-hidden="true" />}
            title="Aucun challenge en cours"
            body="Votre titulaire lance les challenges depuis PharmaBoost : votre part et celle de l'équipe s'afficheront ici dès l'ouverture."
          />
        )}
      </section>

      <section className="m-rise space-y-3" style={{ animationDelay: "90ms" }} aria-labelledby="objectifs">
        <SectionTitle title={<span id="objectifs">Mes objectifs</span>} />
        {currentObjectives.length > 0 ? (
          <div className={currentObjectives.length > 1 ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
            {currentObjectives.map((objective) => (
              <ObjectiveCard key={objective.id} objective={objective} />
            ))}
          </div>
        ) : (
          <QuietState
            compact
            icon={<Target className="size-6" aria-hidden="true" />}
            title="Pas d'objectif pour l'instant"
            body={owner ? "Fixez-vous un objectif, ou fixez-en à votre équipe, depuis « Mon équipe »." : "Votre titulaire peut vous fixer des objectifs de la semaine ou du mois : ils s'afficheront ici, avec votre avancée."}
          />
        )}
      </section>

      {board.ended.length > 0 && (
        <section className="m-rise space-y-3" style={{ animationDelay: "140ms" }} aria-labelledby="termines">
          <SectionTitle title={<span id="termines">Terminés</span>} />
          <MCard className="overflow-hidden p-0 sm:p-0">
            <ul className="divide-y divide-ink-100">
              {board.ended.map((challenge) => (
                <EndedChallengeRow key={challenge.id} challenge={challenge} />
              ))}
            </ul>
          </MCard>
        </section>
      )}

      <p className="px-1 text-[12px] leading-5 text-text-tertiary">
        Comptés : les ventes enregistrées des produits du challenge et les conseils déclarés « Vendu » à votre comptoir. Un comptoir
        appartient à la personne à qui il est attribué au moment de la vente. Les montants négociés avec le laboratoire ne sont pas
        affichés ici ; vos primes validées sont dans Mon espace.
      </p>
    </div>
  );
}
