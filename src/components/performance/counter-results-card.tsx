import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { CounterResults } from "@/core/counter/results";
import { formatNumber } from "@/lib/format";

/**
 * « Au comptoir » : ce que l'équipe a répondu dans la fenêtre du poste de caisse (Vendu / Non vendu), sur les ventes terminées.
 *
 * Ces chiffres sont des DÉCLARATIONS du comptoir, présentées à part des ventes confirmées de la page : le logiciel de gestion ne dit
 * pas quel produit a été encaissé, ni par qui. Le détail est donc par poste de caisse, jamais par collaborateur deviné.
 */
export function CounterResultsCard({ results, periodLabel }: { results: CounterResults; periodLabel: string }) {
  const empty = results.salesClosed === 0;
  const stats: { label: string; value: string; hint?: string }[] = [
    { label: "Conseils proposés", value: formatNumber(results.proposed), hint: `sur ${formatNumber(results.salesClosed)} vente${results.salesClosed > 1 ? "s" : ""} terminée${results.salesClosed > 1 ? "s" : ""}` },
    { label: "Déclarés vendus", value: formatNumber(results.sold), hint: results.conversionRate === null ? "aucune réponse donnée" : `${Math.round(results.conversionRate * 100)} % des conseils traités` },
    { label: "Non vendus", value: formatNumber(results.notSold) },
    { label: "Sans réponse", value: formatNumber(results.unanswered), hint: "vente terminée sans cliquer" },
    { label: "Dans un challenge", value: formatNumber(results.challengeSold), hint: "ventes déclarées" },
    { label: "À date courte", value: formatNumber(results.shortDateSold), hint: "produits écoulés" },
  ];

  return (
    <Card>
      <CardHeader
        title="Au comptoir, avec la fenêtre du poste de caisse"
        description={`Les réponses « Vendu » / « Non vendu » de votre équipe, sur les ventes terminées (${periodLabel.toLowerCase()}). Ce sont des déclarations au comptoir, pas des ventes lues dans votre logiciel de gestion.`}
      />
      <CardContent className="space-y-5">
        {empty ? (
          <p className="rounded-lg bg-surface-sunken px-4 py-6 text-center text-[13px] text-text-secondary">
            Aucune vente terminée avec la fenêtre du poste de caisse sur cette période. Dès qu&apos;un pharmacien clique « Vente terminée », elle apparaît ici.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-lg bg-surface-sunken px-3.5 py-3">
                  <dt className="text-[12px] text-text-secondary">{stat.label}</dt>
                  <dd className="mt-0.5 text-[20px] leading-6 font-semibold text-text-primary tabular">{stat.value}</dd>
                  {stat.hint && <p className="mt-0.5 text-[11.5px] text-text-tertiary">{stat.hint}</p>}
                </div>
              ))}
            </dl>

            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[13px] font-semibold text-text-primary">Par collaborateur</h3>
                <Table className="min-w-0">
                  <caption className="sr-only">Les conseils proposés, vendus et non vendus par collaborateur.</caption>
                  <THead>
                    <TR>
                      <TH>Collaborateur</TH>
                      <TH numeric>Ventes</TH>
                      <TH numeric>Proposés</TH>
                      <TH numeric>Vendus</TH>
                      <TH numeric>Non vendus</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {results.byPost.map((post) => (
                      <TR key={post.post}>
                        <TD className="font-medium text-text-primary">{post.post}</TD>
                        <TD numeric>{formatNumber(post.sales)}</TD>
                        <TD numeric>{formatNumber(post.proposed)}</TD>
                        <TD numeric>{formatNumber(post.sold)}</TD>
                        <TD numeric>{formatNumber(post.notSold)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <p className="mt-2 text-[11.5px] text-text-tertiary">Chaque comptoir est attribué à un collaborateur (Mes comptoirs) : ses ventes lui reviennent. Un comptoir sans collaborateur apparaît sous son nom.</p>
              </div>

              <div>
                <h3 className="mb-2 text-[13px] font-semibold text-text-primary">Produits déclarés vendus</h3>
                {results.products.length === 0 ? (
                  <p className="rounded-lg bg-surface-sunken px-4 py-5 text-[13px] text-text-secondary">Aucun conseil n&apos;a été déclaré vendu sur cette période.</p>
                ) : (
                  <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                    {results.products.map((product) => (
                      <li key={product.name} className="flex items-center justify-between gap-3 px-3.5 py-2 text-[13px]">
                        <span className="min-w-0 truncate text-text-primary" title={product.name}>
                          {product.name}
                        </span>
                        <span className="shrink-0 font-semibold text-text-primary tabular">{formatNumber(product.sold)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {results.challenges.length > 0 && (
                  <p className="mt-2 text-[12px] text-text-secondary">
                    Challenges : {results.challenges.map((challenge) => `${challenge.title} (${challenge.sold})`).join(" · ")}
                  </p>
                )}
              </div>
            </div>

            <p className="text-[12px] text-text-tertiary">
              {formatNumber(results.emailsSaved)} adresse{results.emailsSaved > 1 ? "s" : ""} e-mail recueillie{results.emailsSaved > 1 ? "s" : ""} avec l&apos;accord du patient · {formatNumber(results.reportsSent)} bilan{results.reportsSent > 1 ? "s" : ""} envoyé{results.reportsSent > 1 ? "s" : ""}. Un bilan mensuel vous est aussi envoyé par e-mail le 1<sup>er</sup> de chaque mois.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
