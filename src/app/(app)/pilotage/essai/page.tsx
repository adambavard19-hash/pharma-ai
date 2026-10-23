import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Medal } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadSoldCounter } from "@/server/services/sold-counter";
import { euros } from "@/core/counter/sales-report";
import { PageHeader } from "@/components/ui/page";
import { SoldCounter } from "@/components/performance/sold-counter";
import { VersionSwitch } from "@/components/performance/version-switch";
import { EXAMPLE_PHARMACY, EXAMPLE_PRODUCTS, EXAMPLE_TEAM } from "@/components/performance/sold-counter-example";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Performances — essai" };

/**
 * Essai de l'onglet Performances du titulaire (fondateur, 23 oct. 2026) : le compteur des conseils vendus en tête, puis qui
 * en a vendu le plus ce mois-ci et les conseils qui partent le mieux. À comparer avec la version actuelle (/pilotage).
 * Développement seulement.
 */
export default async function PerformanceEssaiPage({ searchParams }: { searchParams: Promise<{ exemple?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const session = await requirePermission(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
  const example = (await searchParams).exemple !== undefined;
  const real = await loadSoldCounter({ pharmacyId: session.scope.pharmacyId, now: new Date() });
  const periods = example ? EXAMPLE_PHARMACY : real.periods;
  const month = example ? { byPerson: EXAMPLE_TEAM, topProducts: EXAMPLE_PRODUCTS } : real.reports[2];
  const people = [...month.byPerson].sort((a, b) => b.sold - a.sold || b.revenueCents - a.revenueCents).slice(0, 6);
  const best = people[0]?.sold ?? 0;

  return (
    <div className="space-y-6">
      <VersionSwitch current="/pilotage" example={example} exampleHref="/pilotage/essai" />
      <PageHeader title="Performances" description="Ce que votre équipe a vendu grâce aux conseils PharmaBoost. Ces chiffres ne sont visibles que de vous." />

      <SoldCounter periods={periods} title="Toute l'officine" subtitle="Conseils vendus au comptoir, déclarés « Vendu »" initial={2} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="qui-vend" className="rounded-2xl border border-border-subtle bg-surface-card p-5">
          <h2 id="qui-vend" className="text-[17px] font-semibold text-text-primary">Qui a vendu le plus de conseils ce mois-ci</h2>
          {people.length === 0 ? (
            <p className="mt-3 text-[14px] text-text-secondary">Aucune vente terminée ce mois-ci.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {people.map((person, i) => (
                <li key={person.who} className="flex items-center gap-3">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-ink-100 text-ink-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-surface-sunken text-text-tertiary")}>
                    {i < 3 ? <Medal className="size-4" aria-label={`${i + 1}e`} /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14.5px] font-medium text-text-primary">{person.who}</span>
                      <span className="text-[14.5px] font-semibold tabular text-brand-700 dark:text-brand-400">{person.sold} vendu{person.sold > 1 ? "s" : ""}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-sunken">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${best > 0 ? (person.sold / best) * 100 : 0}%` }} />
                    </div>
                    <p className="mt-0.5 text-[12px] text-text-tertiary">{euros(person.revenueCents)} ajoutés · {person.sales} vente{person.sales > 1 ? "s" : ""}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="top-conseils" className="rounded-2xl border border-border-subtle bg-surface-card p-5">
          <h2 id="top-conseils" className="text-[17px] font-semibold text-text-primary">Les conseils qui partent le mieux ce mois-ci</h2>
          {month.topProducts.length === 0 ? (
            <p className="mt-3 text-[14px] text-text-secondary">Aucun conseil vendu ce mois-ci.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border-subtle">
              {month.topProducts.slice(0, 6).map((product) => (
                <li key={product.name} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="truncate text-[14px] text-text-primary">{product.name}</span>
                  <span className="shrink-0 text-[13.5px] tabular text-text-secondary">{product.sold} × · {euros(product.revenueCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-[14px] text-text-secondary">
        Le classement détaillé (proposés, validés, taux) et les challenges restent juste en dessous, comme aujourd&apos;hui.{" "}
        <Link href="/pilotage" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline dark:text-brand-400">
          Voir le classement <ArrowRight className="size-3.5" />
        </Link>
      </p>
    </div>
  );
}
