import { Flame, Medal, Target } from "lucide-react";
import { euros, percent, type SalesReport } from "@/core/counter/sales-report";
import { cn } from "@/lib/utils";

/**
 * Les blocs de l'onglet Performances autour du compteur des conseils vendus (fondateur, 23 oct. 2026) : pour chacun, sa
 * place dans l'équipe et ses conseils qui partent le mieux ; pour le titulaire, qui vend le plus et ce qui part le mieux
 * dans toute l'officine. Rendus côté serveur à partir des rapports de `loadSoldCounter`.
 */

type Person = SalesReport["byPerson"][number];
type Product = SalesReport["topProducts"][number];

/**
 * Sa place dans l'équipe ce mois-ci, ce qu'il manque pour passer devant, le classement de l'équipe en CONSEILS VENDUS et ses
 * conseils qui partent le mieux. Aucun montant : le membre de l'équipe ne voit ni chiffre d'affaires ni marge (fondateur, 4 nov. 2026).
 */
export function MyPlaceAndProducts({ me, ranking: unsorted, products }: { me: string; ranking: Person[]; products: Product[] }) {
  const ranking = [...unsorted].sort((a, b) => b.sold - a.sold);
  const rank = ranking.findIndex((person) => person.who === me);
  const ahead = rank > 0 ? ranking[rank - 1] : null;
  const gap = ahead ? ahead.sold - (ranking[rank]?.sold ?? 0) + 1 : 0;
  const myMonth = { topProducts: products };
  return (
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
                  Encore{" "}
                  <strong>
                    {gap} conseil{gap > 1 ? "s" : ""} vendu{gap > 1 ? "s" : ""}
                  </strong>{" "}
                  pour passer devant {ahead.who}.
                </span>
              ) : (
                <span>Vous êtes en tête de l&apos;équipe : bravo !</span>
              )}
            </p>
          </>
        )}
        {ranking.length > 0 && (
          <ol className="mt-4 space-y-1.5 border-t border-border-subtle pt-3" aria-label="Classement de l'équipe en conseils vendus">
            {ranking.slice(0, 8).map((person, i) => (
              <li key={person.who} className={cn("flex items-center gap-3 rounded-lg px-2 py-1 text-[14px]", person.who === me && "bg-brand-50 font-semibold dark:bg-brand-950/40")}>
                <span className="w-5 text-right text-[13px] text-text-tertiary tabular">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-text-primary">{person.who === me ? "Vous" : person.who}</span>
                <span className="shrink-0 tabular text-text-primary">
                  {person.sold} conseil{person.sold > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="mes-top" className="rounded-2xl border border-border-subtle bg-surface-card p-5">
        <h2 id="mes-top" className="text-[17px] font-semibold text-text-primary">
          Mes conseils qui partent le mieux ce mois-ci
        </h2>
        {myMonth.topProducts.length === 0 ? (
          <p className="mt-3 text-[14px] text-text-secondary">Aucun conseil vendu ce mois-ci.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border-subtle">
            {myMonth.topProducts.slice(0, 6).map((product) => (
              <li key={product.name} className="flex items-baseline justify-between gap-3 py-2">
                <span className="truncate text-[14px] text-text-primary">{product.name}</span>
                <span className="shrink-0 text-[13.5px] tabular text-text-secondary">{product.sold} vendu{product.sold > 1 ? "s" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Pour le titulaire seul : chaque pharmacien classé par conseils vendus, avec le chiffre d'affaires et la marge qu'il a générés
 * (fondateur, 4 nov. 2026), et les conseils qui partent le mieux dans toute l'officine.
 */
export function TeamSoldBoard({ people: unsorted, products }: { people: Person[]; products: Product[] }) {
  const people = [...unsorted].sort((a, b) => b.sold - a.sold || b.revenueCents - a.revenueCents).slice(0, 12);
  const best = people[0]?.sold ?? 0;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="qui-vend" className="rounded-2xl border border-border-subtle bg-surface-card p-5">
        <h2 id="qui-vend" className="text-[17px] font-semibold text-text-primary">
          Classement de l&apos;équipe ce mois-ci
        </h2>
        {people.length === 0 ? (
          <p className="mt-3 text-[14px] text-text-secondary">Aucune vente terminée ce mois-ci.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {people.map((person, i) => (
              <li key={person.who} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                    i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-ink-100 text-ink-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-surface-sunken text-text-tertiary",
                  )}
                >
                  {i < 3 ? <Medal className="size-4" aria-label={`${i + 1}e`} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[14.5px] font-medium text-text-primary">{person.who}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[12px] font-semibold tabular text-brand-800 dark:bg-brand-950/40 dark:text-brand-300" title="Clients repartis avec au moins un conseil vendu">
                        {person.sales > 0 ? percent(person.withAdvice / person.sales) : "—"} de taux
                      </span>
                      <span className="text-[14.5px] font-semibold tabular text-brand-700 dark:text-brand-400">
                        {person.sold} vendu{person.sold > 1 ? "s" : ""}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-sunken">
                    <span
                      className="block h-full rounded-full bg-brand-500"
                      style={{
                        width: `${best > 0 ? (person.sold / best) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-[12px] text-text-tertiary">
                    {euros(person.revenueCents)} de chiffre d&apos;affaires · {person.marginCents > 0 ? euros(person.marginCents) : "—"} de marge HT · {person.withAdvice} client{person.withAdvice > 1 ? "s" : ""} conseillé{person.withAdvice > 1 ? "s" : ""} sur {person.sales}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="top-conseils" className="rounded-2xl border border-border-subtle bg-surface-card p-5">
        <h2 id="top-conseils" className="text-[17px] font-semibold text-text-primary">
          Les conseils qui partent le mieux ce mois-ci
        </h2>
        {products.length === 0 ? (
          <p className="mt-3 text-[14px] text-text-secondary">Aucun conseil vendu ce mois-ci.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border-subtle">
            {products.slice(0, 6).map((product) => (
              <li key={product.name} className="flex items-baseline justify-between gap-3 py-2">
                <span className="truncate text-[14px] text-text-primary">{product.name}</span>
                <span className="shrink-0 text-[13.5px] tabular text-text-secondary">
                  {product.sold} × · {euros(product.revenueCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
