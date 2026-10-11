import Link from "next/link";
import { Banknote, ChevronRight, GraduationCap, Target } from "lucide-react";
import type { TenantScope } from "@/server/db/tenant";
import { loadMyBonuses, loadMyObjectives, loadPersonalResults } from "@/server/services/mobile/personal";
import { listMyTrainingSuggestions, runCoach } from "@/server/services/mobile/coach";
import { bonusTotals } from "@/core/personal/bonuses";
import { universeLabel } from "@/config/universes";
import { MCard, Pill } from "../../../_components/ui";
import { ObjectiveCard } from "../../challenges/_components/cards";
import { euros } from "../../challenges/_components/visuals";
import { ResultsSwitch } from "./results-switch";
import { SuggestionCard } from "./suggestion-card";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** Le lien d'une formation dans l'Académie de l'application. */
export function trainingHref(contentId: string): string {
  return `/m/formations/${contentId}`;
}

function Heading({ children, id }: { children: string; id: string }) {
  return (
    <h2 id={id} className="px-1 text-[13px] font-semibold tracking-wide text-ink-500 uppercase">
      {children}
    </h2>
  );
}

/**
 * Les rubriques personnelles de « Mon espace » pour un membre d'une équipe cliente : mes résultats, mes primes, mes
 * objectifs, les formations suggérées par le coach. Tout est lu pour la personne connectée, dans l'officine active.
 */
export async function PersonalSections({ scope }: { scope: TenantScope }) {
  // Le coach tourne à l'ouverture de Mon espace : idempotent, il n'ajoute une suggestion que si les règles la justifient.
  try {
    await runCoach(scope);
  } catch (error) {
    console.error("[coach] passage impossible", error);
  }
  const [results, bonuses, objectives, suggestions] = await Promise.all([loadPersonalResults(scope), loadMyBonuses(scope), loadMyObjectives(scope), listMyTrainingSuggestions(scope)]);
  const totals = bonusTotals(bonuses);
  const current = objectives.filter((objective) => objective.progress.daysRemaining > 0).slice(0, 3);

  return (
    <>
      <section className="space-y-2.5" aria-labelledby="mes-resultats">
        <Heading id="mes-resultats">Mes résultats</Heading>
        <MCard className="space-y-3">
          <ResultsSwitch results={results} />
          <p className="text-[12px] leading-[1.5] text-text-tertiary">
            Vos chiffres seulement : les conseils PharmaBoost apparus sur les ventes des comptoirs qui vous sont attribués (ou que vous avez
            saisies), et ceux que vous avez validés — acceptés, présentés ou déclarés « Vendu ». Un « Non vendu » compte comme proposé, non validé.
          </p>
        </MCard>
      </section>

      <section className="space-y-2.5" aria-labelledby="mes-primes">
        <Heading id="mes-primes">Mes primes</Heading>
        {bonuses.length > 0 ? (
          <MCard className="space-y-3 p-0 sm:p-0">
            <div className="grid grid-cols-2 gap-2 px-4 pt-4 sm:px-5 sm:pt-5">
              <div className="rounded-2xl bg-success-50 px-3 py-2.5 ring-1 ring-success-200 ring-inset">
                <p className="text-[11.5px] font-medium text-success-800">Validées, à verser</p>
                <p className="text-[20px] font-bold tracking-[-0.02em] text-success-800 tabular">{euros(totals.validatedCents)}</p>
              </div>
              <div className="rounded-2xl bg-ink-50 px-3 py-2.5">
                <p className="text-[11.5px] font-medium text-text-tertiary">Versées</p>
                <p className="text-[20px] font-bold tracking-[-0.02em] text-ink-900 tabular">{euros(totals.paidCents)}</p>
              </div>
            </div>
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {bonuses.map((bonus) => (
                <li key={bonus.id} className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-50 text-success-700">
                    <Banknote className="size-[18px]" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-ink-900">{bonus.label}</p>
                    <p className="truncate text-[12px] text-text-tertiary">
                      {bonus.status === "PAID" && bonus.paidAt ? `Versée le ${DATE.format(bonus.paidAt)}` : bonus.validatedAt ? `Validée le ${DATE.format(bonus.validatedAt)}` : "Validée"}
                      {bonus.origin ? ` · ${bonus.origin}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-bold text-ink-900 tabular">{euros(bonus.amountCents)}</p>
                    <Pill tone={bonus.status === "PAID" ? "neutral" : "success"} className="mt-0.5">
                      {bonus.status === "PAID" ? "Versée" : "Validée"}
                    </Pill>
                  </div>
                </li>
              ))}
            </ul>
          </MCard>
        ) : (
          <MCard className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
              <Banknote className="size-5" aria-hidden="true" />
            </span>
            <p className="text-[13.5px] leading-5 text-text-secondary">
              Aucune prime validée pour l&apos;instant. Seules les primes <strong className="font-semibold text-ink-800">validées par votre titulaire</strong> s&apos;affichent ici —
              jamais une estimation.
            </p>
          </MCard>
        )}
      </section>

      <section className="space-y-2.5" aria-labelledby="mes-objectifs">
        <div className="flex items-end justify-between gap-3 pr-1">
          <Heading id="mes-objectifs">Mes objectifs</Heading>
          <Link href="/m/challenges" className="-my-2 inline-flex min-h-11 items-center gap-0.5 text-[13.5px] font-semibold text-brand-700">
            Challenges
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        {current.length > 0 ? (
          <div className="space-y-3">
            {current.map((objective) => (
              <ObjectiveCard key={objective.id} objective={objective} />
            ))}
          </div>
        ) : (
          <MCard className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
              <Target className="size-5" aria-hidden="true" />
            </span>
            <p className="text-[13.5px] leading-5 text-text-secondary">Aucun objectif en cours. Votre titulaire les fixe avec vous ; vous suivez ici votre avancée.</p>
          </MCard>
        )}
      </section>

      <section className="space-y-2.5" aria-labelledby="formations-suggerees">
        <Heading id="formations-suggerees">Recommandations de formation</Heading>
        {suggestions.length > 0 ? (
          <ul className="space-y-3">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                id={suggestion.id}
                href={trainingHref(suggestion.contentId)}
                title={suggestion.title}
                universe={suggestion.universe ? universeLabel(suggestion.universe) : null}
                message={suggestion.message}
              />
            ))}
          </ul>
        ) : (
          <MCard className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <GraduationCap className="size-5" aria-hidden="true" />
            </span>
            <p className="text-[13.5px] leading-5 text-text-secondary">
              Rien à vous suggérer. Le coach ne propose une formation que sur des chiffres répétés — jamais pour un refus du patient, une
              question de prix ou une rupture de stock.
            </p>
          </MCard>
        )}
      </section>
    </>
  );
}
