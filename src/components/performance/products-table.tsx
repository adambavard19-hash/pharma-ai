import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ProductRow } from "@/core/performance/types";
import { formatCents, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RATE_NOTE, categoryLabel, formatRate } from "./format";

/**
 * Les produits en tête : un tableau quand la carte est assez large, des cartes
 * empilées sinon (la bascule suit la largeur de la CARTE, pas celle de l'écran :
 * à côté d'un autre bloc, un tableau de six colonnes serait écrasé).
 *
 * Conseils (proposés, acceptés) et ventes (unités, chiffre d'affaires) n'ont
 * pas la même horloge ; une ligne vendue sans prix saisi ne fait pas de chiffre
 * d'affaires et le dit (« Prix non saisi »), au lieu d'afficher 0,00 €.
 */

/** Le chiffre d'affaires d'un produit : le montant, « Prix non saisi » ou un tiret. */
function Revenue({ product, max, bar }: { product: ProductRow; max: number; bar: boolean }) {
  if (product.revenueTtcCents > 0) {
    const width = max > 0 ? Math.min(100, Math.max(3, (product.revenueTtcCents / max) * 100)) : 0;
    return (
      <>
        <span className="font-semibold text-text-primary tabular">{formatCents(product.revenueTtcCents)}</span>
        {bar && (
          <span className="mt-1 ml-auto block h-1 w-24 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
            <span className="block h-full rounded-full bg-accent-400" style={{ width: `${Math.round(width * 10) / 10}%` }} />
          </span>
        )}
      </>
    );
  }
  if (product.unitsSold > 0) {
    return <span className="text-[12.5px] font-medium text-warning-700 dark:text-warning-500">Prix non saisi</span>;
  }
  return (
    <>
      <span aria-hidden="true" className="text-text-tertiary">
        —
      </span>
      <span className="sr-only">Aucune vente confirmée</span>
    </>
  );
}

function Rate({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Taux non calculable</span>
      </>
    );
  }
  return <>{formatRate(value)}</>;
}

const Units = ({ value }: { value: number }) => (value > 0 ? <>{formatNumber(value)}</> : <>—</>);

export function ProductsTable({ products, className }: { products: ProductRow[]; className?: string }) {
  const maxRevenue = products.reduce((max, product) => Math.max(max, product.revenueTtcCents), 0);

  return (
    <Card className={cn("@container", className)}>
      <CardHeader title="Produits en tête" description="Classés par chiffre d'affaires attribué, puis par conseils acceptés." />
      {products.length === 0 ? (
        <CardContent>
          <p className="rounded-lg bg-surface-sunken px-4 py-6 text-center text-[13px] text-text-secondary">Aucun produit conseillé sur cette période.</p>
        </CardContent>
      ) : (
        <>
          {/* Carte large : le tableau. */}
          <div className="hidden @xl:block">
            <Table className="min-w-0">
              <caption className="sr-only">Les produits les plus conseillés, classés par chiffre d&apos;affaires attribué.</caption>
              <THead>
                <TR>
                  <TH className="pl-5">Produit</TH>
                  <TH numeric>Proposés</TH>
                  <TH numeric>Acceptés</TH>
                  <TH numeric className="w-40 leading-4 whitespace-normal">
                    Taux (sur les conseils tranchés)
                  </TH>
                  <TH numeric>Unités vendues</TH>
                  <TH numeric className="pr-5">
                    CA TTC
                  </TH>
                </TR>
              </THead>
              <TBody>
                {products.map((product) => (
                  <TR key={product.key} interactive>
                    <TD className="w-full max-w-0 pl-5">
                      <p className="truncate font-medium text-text-primary" title={product.label}>
                        {product.label}
                      </p>
                      <p className="truncate text-[12px] text-text-tertiary">{categoryLabel(product.category)}</p>
                    </TD>
                    <TD numeric>{formatNumber(product.proposed)}</TD>
                    <TD numeric>{formatNumber(product.accepted)}</TD>
                    <TD numeric>
                      <Rate value={product.acceptanceRate} />
                    </TD>
                    <TD numeric>
                      <Units value={product.unitsSold} />
                    </TD>
                    <TD numeric className="pr-5 whitespace-nowrap">
                      <Revenue product={product} max={maxRevenue} bar />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          {/* Carte étroite : une carte par produit. */}
          <ul className="divide-y divide-border-subtle border-t border-border-subtle @xl:hidden">
            {products.map((product) => (
              <li key={product.key} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-text-primary" title={product.label}>
                      {product.label}
                    </p>
                    <p className="truncate text-[12px] text-text-tertiary">{categoryLabel(product.category)}</p>
                  </div>
                  <p className="shrink-0 text-right text-[13.5px]">
                    <Revenue product={product} max={maxRevenue} bar={false} />
                  </p>
                </div>
                <dl className="mt-2.5 grid grid-cols-4 gap-2">
                  <div>
                    <dt className="text-[11.5px] text-text-tertiary">Proposés</dt>
                    <dd className="text-[13px] font-medium text-text-primary tabular">{formatNumber(product.proposed)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] text-text-tertiary">Acceptés</dt>
                    <dd className="text-[13px] font-medium text-text-primary tabular">{formatNumber(product.accepted)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] text-text-tertiary">Taux</dt>
                    <dd className="text-[13px] font-medium text-text-primary tabular">
                      <Rate value={product.acceptanceRate} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] text-text-tertiary">Vendus</dt>
                    <dd className="text-[13px] font-medium text-text-primary tabular">
                      <Units value={product.unitsSold} />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <p className="border-t border-border-subtle px-5 py-3 text-[12px] leading-5 text-text-tertiary">
            Les conseils sont comptés à leur date de proposition, les ventes et le chiffre d&apos;affaires à la date de la vente. {RATE_NOTE}
          </p>
        </>
      )}
    </Card>
  );
}
