import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Lock, Target, Users } from "lucide-react";
import { requireClientScope } from "@/server/auth/user-session";
import { loadTeamDesk, type TeamBonus } from "@/server/services/mobile/personal";
import { BONUS_STATUS_LABELS, bonusTotals } from "@/core/personal/bonuses";
import { MCard, Pill, QuietState, ScreenTitle, SectionTitle } from "../../../_components/ui";
import { ObjectiveCard } from "../_components/cards";
import { euros, percentLabel, rankLabel } from "../_components/visuals";
import { ArchiveObjectiveButton, BonusButtons, BonusForm, ObjectiveForm } from "../_components/team-forms";

export const metadata: Metadata = { title: "Mon équipe" };

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/**
 * « Mon équipe » dans l'application : réservé au TITULAIRE de l'officine active (vérifié en base par le service).
 * Résultats du mois de chacun, objectifs personnels, primes à proposer, valider, marquer versées ou annuler. Les
 * collaborateurs n'arrivent jamais ici ; et rien d'une autre officine n'est lu.
 */
export default async function TeamDeskPage() {
  const { session, scope } = await requireClientScope();
  const desk = await loadTeamDesk(scope);

  const back = (
    <Link href="/m/challenges" className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-[14px] font-semibold text-brand-700">
      <ChevronLeft className="size-4" aria-hidden="true" />
      Challenges
    </Link>
  );

  if (!desk) {
    return (
      <div className="space-y-4">
        {back}
        <QuietState icon={<Lock className="size-6" aria-hidden="true" />} title="Réservé au titulaire" body="Les objectifs d'équipe et les primes se règlent par le titulaire de l'officine." />
      </div>
    );
  }

  const members = desk.members.map((member) => ({ id: member.id, name: member.name }));
  const proposed = desk.bonuses.filter((bonus) => bonus.status === "PROPOSED");
  const others = desk.bonuses.filter((bonus) => bonus.status !== "PROPOSED");
  const totals = bonusTotals(desk.bonuses);
  const links = [
    ...desk.objectives.map((objective) => ({ value: `objective:${objective.id}`, label: `Objectif · ${objective.title}`, userId: objective.userId })),
    ...desk.challenges.map((challenge) => ({ value: `challenge:${challenge.id}`, label: `Challenge · ${challenge.title}`, userId: null })),
  ];
  const people = desk.ranking.rows;

  return (
    <div className="space-y-7">
      <div className="space-y-1">
        {back}
        <ScreenTitle title="Mon équipe" subtitle={`${session.activePharmacy?.name ?? "Votre officine"} · visible de vous seul.`} />
      </div>

      <section className="m-rise space-y-3" aria-labelledby="resultats-equipe">
        <SectionTitle title={<span id="resultats-equipe">Ce mois-ci</span>} />
        <MCard className="overflow-hidden p-0 sm:p-0">
          <div className="grid grid-cols-3 gap-2 border-b border-ink-100 p-4 sm:p-5">
            <Summary label="Proposés" value={desk.ranking.totals.proposed} />
            <Summary label="Validés" value={desk.ranking.totals.validated} />
            <Summary label="Taux" value={percentLabel(desk.ranking.totals.rate)} emphasis />
          </div>
          {people.length > 0 ? (
            <ol className="divide-y divide-ink-100">
              {people.map((row) => (
                <li key={row.userId ?? "non-attribue"} className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-800 tabular">{row.userId !== null && row.proposed > 0 ? rankLabel(row.rank) : "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink-900">{row.name}</span>
                  <span className="text-right text-[12.5px] text-text-tertiary tabular">
                    <strong className="text-[14px] font-bold text-ink-900">{row.validated}</strong> / {row.proposed} · {percentLabel(row.rate)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-4 py-4 text-[13.5px] text-text-secondary">Ajoutez vos collaborateurs depuis l&apos;écran Équipe du comptoir.</p>
          )}
        </MCard>
        <p className="px-1 text-[12px] leading-5 text-text-tertiary">Validés / proposés : les conseils PharmaBoost des comptoirs attribués à chacun, déclarés au comptoir. Le détail est dans « Mon équipe » du comptoir.</p>
      </section>

      <section className="m-rise space-y-3" style={{ animationDelay: "60ms" }} aria-labelledby="objectifs-equipe">
        <SectionTitle title={<span id="objectifs-equipe">Objectifs</span>} />
        {desk.objectives.length > 0 ? (
          <div className={desk.objectives.length > 1 ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
            {desk.objectives.map((objective) => (
              <div key={objective.id} className="space-y-1">
                <ObjectiveCard objective={objective} showOwner />
                <div className="flex justify-end">
                  <ArchiveObjectiveButton id={objective.id} title={objective.title} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <QuietState compact icon={<Target className="size-6" aria-hidden="true" />} title="Aucun objectif" body="Un objectif simple et mesuré (conseils validés, formations terminées…) aide chacun à se situer." />
        )}
        <ObjectiveForm members={members} challenges={desk.challenges} />
      </section>

      <section className="m-rise space-y-3" style={{ animationDelay: "120ms" }} aria-labelledby="primes-equipe">
        <SectionTitle title={<span id="primes-equipe">Primes</span>} />
        <div className="grid grid-cols-2 gap-2">
          <Summary label="Validées, à verser" value={euros(totals.validatedCents)} emphasis />
          <Summary label="Versées" value={euros(totals.paidCents)} />
        </div>
        {proposed.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 text-[13px] font-semibold text-accent-800">À valider ({proposed.length})</p>
            {proposed.map((bonus) => (
              <BonusRow key={bonus.id} bonus={bonus} />
            ))}
          </div>
        )}
        {others.length > 0 && (
          <div className="space-y-2">
            {others.map((bonus) => (
              <BonusRow key={bonus.id} bonus={bonus} />
            ))}
          </div>
        )}
        {desk.bonuses.length === 0 && (
          <QuietState compact icon={<Users className="size-6" aria-hidden="true" />} title="Aucune prime" body="Proposez une prime, puis validez-la : votre collaborateur la voit dans « Mes primes » une fois validée, jamais avant." />
        )}
        <BonusForm members={members} links={links} />
      </section>
    </div>
  );
}

function Summary({ label, value, emphasis = false }: { label: string; value: string | number; emphasis?: boolean }) {
  return (
    <div className={emphasis ? "rounded-2xl bg-brand-50 px-3 py-2.5 ring-1 ring-brand-100 ring-inset" : "rounded-2xl bg-ink-50 px-3 py-2.5"}>
      <p className="truncate text-[11.5px] font-medium text-text-tertiary">{label}</p>
      <p className={emphasis ? "text-[20px] font-bold tracking-[-0.02em] text-brand-800 tabular" : "text-[20px] font-bold tracking-[-0.02em] text-ink-900 tabular"}>{value}</p>
    </div>
  );
}

const TONE = { PROPOSED: "amber", VALIDATED: "success", PAID: "neutral", CANCELLED: "neutral" } as const;

function BonusRow({ bonus }: { bonus: TeamBonus }) {
  const when = bonus.status === "PAID" && bonus.paidAt ? `versée le ${DATE.format(bonus.paidAt)}` : bonus.validatedAt ? `validée le ${DATE.format(bonus.validatedAt)}` : `proposée le ${DATE.format(bonus.createdAt)}`;
  return (
    <MCard className={bonus.status === "CANCELLED" ? "space-y-3 opacity-60" : "space-y-3"}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[12.5px] font-semibold text-brand-700">{bonus.userName}</p>
          <p className="text-[15px] leading-snug font-semibold text-ink-900">{bonus.label}</p>
          <p className="text-[12px] text-text-tertiary">
            {when}
            {bonus.origin ? ` · ${bonus.origin}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[16px] font-bold text-ink-900 tabular">{euros(bonus.amountCents)}</p>
          <Pill tone={TONE[bonus.status]} className="mt-0.5">
            {BONUS_STATUS_LABELS[bonus.status]}
          </Pill>
        </div>
      </div>
      <BonusButtons id={bonus.id} status={bonus.status} />
    </MCard>
  );
}
