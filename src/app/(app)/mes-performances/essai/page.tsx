import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flame, Target } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { myComptoirs } from "@/server/services/comptoirs";
import { loadSoldCounter } from "@/server/services/sold-counter";
import { euros } from "@/core/counter/sales-report";
import { PageHeader } from "@/components/ui/page";
import { SoldCounter } from "@/components/performance/sold-counter";
import { VersionSwitch } from "@/components/performance/version-switch";
import { EXAMPLE_ME, EXAMPLE_PRODUCTS, EXAMPLE_TEAM } from "@/components/performance/sold-counter-example";

export const metadata: Metadata = { title: "Mes performances — essai" };

/**
 * Essai d'un onglet « Mes performances » pour le pharmacien (fondateur, 23 oct. 2026). Aujourd'hui, le pharmacien n'a pas
 * d'onglet Performances : seul l'Historique montre ses ventes. Ici : SES conseils vendus (ses ventes, ou celles de ses
 * comptoirs, comme l'Historique), sa place dans l'équipe ce mois-ci et ce qu'il lui manque pour passer devant, ses
 * conseils qui partent le mieux. Il ne voit ni le chiffre d'affaires des autres ni leurs détails. Développement seulement.
 */
export default async function MesPerformancesEssaiPage({ searchParams }: { searchParams: Promise<{ exemple?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const now = new Date();
  const { pharmacyId, userId } = session.scope;
  const postIds = (await myComptoirs(session.scope)).postIds;
  const [mine, team] = await Promise.all([loadSoldCounter({ pharmacyId, now, onlyFor: { userId, postIds } }), loadSoldCounter({ pharmacyId, now })]);

  const example = (await searchParams).exemple !== undefined;
  const periods = example ? EXAMPLE_ME : mine.periods;
  const myMonth = example ? { topProducts: EXAMPLE_PRODUCTS } : mine.reports[2];
  const ranking = [...(example ? EXAMPLE_TEAM : team.reports[2].byPerson)].sort((a, b) => b.sold - a.sold);
  // En exemple, la personne connectée prend la 2e place du classement d'exemple.
  const me = example ? EXAMPLE_TEAM[1].who : session.user.fullName;
  const rank = ranking.findIndex((person) => person.who === me);
  const ahead = rank > 0 ? ranking[rank - 1] : null;
  const gap = ahead ? ahead.sold - (ranking[rank]?.sold ?? 0) + 1 : 0;

  return (
    <div className="space-y-6">
      <VersionSwitch current="/historique" example={example} exampleHref="/mes-performances/essai" note="Aujourd'hui, le pharmacien n'a pas d'onglet Performances : ses ventes sont dans Historique." />
      <PageHeader title="Mes performances" description={`${session.user.firstName}, voici les conseils que vous avez vendus au comptoir.`} />

      <SoldCounter periods={periods} title="Mes conseils vendus" subtitle="Vos ventes terminées, déclarées « Vendu »" initial={2} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="ma-place" className="rounded-2xl border border-border-subtle bg-surface-card p-5">
          <h2 id="ma-place" className="flex items-center gap-2 text-[17px] font-semibold text-text-primary">
            <Flame className="size-5 text-orange-500" aria-hidden="true" />
            Ma place dans l&apos;équipe ce mois-ci
          </h2>
          {rank < 0 ? (
            <p className="mt-3 text-[14.5px] leading-6 text-text-secondary">Pas encore de vente terminée ce mois-ci. Votre premier conseil vendu vous fait entrer au classement.</p>
          ) : (
            <>
              <p className="mt-3 text-[40px] leading-none font-bold tabular text-text-primary">
                {rank + 1}
                <sup className="text-[18px]">{rank === 0 ? "er" : "e"}</sup>
                <span className="ml-2 text-[16px] font-medium text-text-secondary">sur {ranking.length}</span>
              </p>
              <p className="mt-3 flex items-start gap-2 text-[14.5px] leading-6 text-text-primary">
                <Target className="mt-1 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                {ahead ? (
                  <span>
                    Encore <strong>{gap} conseil{gap > 1 ? "s" : ""} vendu{gap > 1 ? "s" : ""}</strong> pour passer devant {ahead.who}.
                  </span>
                ) : (
                  <span>Vous êtes en tête de l&apos;équipe : bravo !</span>
                )}
              </p>
            </>
          )}
        </section>

        <section aria-labelledby="mes-top" className="rounded-2xl border border-border-subtle bg-surface-card p-5">
          <h2 id="mes-top" className="text-[17px] font-semibold text-text-primary">Mes conseils qui partent le mieux ce mois-ci</h2>
          {myMonth.topProducts.length === 0 ? (
            <p className="mt-3 text-[14px] text-text-secondary">Aucun conseil vendu ce mois-ci.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border-subtle">
              {myMonth.topProducts.slice(0, 6).map((product) => (
                <li key={product.name} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="truncate text-[14px] text-text-primary">{product.name}</span>
                  <span className="shrink-0 text-[13.5px] tabular text-text-secondary">{product.sold} × · {euros(product.revenueCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
