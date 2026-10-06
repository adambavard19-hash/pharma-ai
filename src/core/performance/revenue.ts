import { metric } from "./metrics";
import type { ConfirmedLineRow, RevenueStats } from "./types";

/**
 * Le chiffre d'affaires attribué : ce que les ventes confirmées ont réellement
 * rapporté, daté du jour de la VENTE (et non de la proposition du conseil).
 *
 *  - une ligne de vente rattachée à un conseil PharmaBoost (origine IA ou règle)
 *    est une vente confirmée ;
 *  - seule une ligne au prix connu (`unitPriceCents > 0`) fait du chiffre
 *    d'affaires ; une ligne au prix 0 (non renseigné) est comptée à part
 *    (`unpricedLines`), jamais valorisée ;
 *  - un ticket de caisse de plusieurs lignes est UNE vente ;
 *  - aucun arrondi caché : les centimes restent des entiers. Seul le panier
 *    moyen, qui est une division, est arrondi au centime le plus proche.
 */

/** Une ligne issue d'un conseil PharmaBoost : les ajouts manuels de l'équipe n'en sont pas. */
export function selectCountedLines(lines: ConfirmedLineRow[]): ConfirmedLineRow[] {
  return lines.filter((line) => line.origin === "AI" || line.origin === "RULE");
}

/** Prix connu : une ligne au prix 0 est « non renseignée », pas gratuite. */
function isPriced(line: ConfirmedLineRow): boolean {
  return line.unitPriceCents > 0;
}

type Totals = {
  revenueCents: number;
  /** Tickets distincts contenant au moins une ligne au prix connu. */
  sales: number;
  pricedLines: number;
  unpricedLines: number;
  units: number;
};

function totalsOf(counted: ConfirmedLineRow[]): Totals {
  const sales = new Set<string>();
  const totals: Totals = { revenueCents: 0, sales: 0, pricedLines: 0, unpricedLines: 0, units: 0 };

  for (const line of counted) {
    totals.units += line.quantity;
    if (isPriced(line)) {
      totals.revenueCents += line.totalCents;
      totals.pricedLines += 1;
      sales.add(line.saleId);
    } else {
      totals.unpricedLines += 1;
    }
  }
  totals.sales = sales.size;
  return totals;
}

/** CA ÷ ventes, au centime le plus proche ; `null` sans vente (jamais 0 € inventé). */
function averageBasket(totals: Totals): number | null {
  return totals.sales > 0 ? Math.round(totals.revenueCents / totals.sales) : null;
}

/**
 * Le chiffre d'affaires attribué de la période et de la période précédente.
 * `lines` / `previousLines` sont les lignes BRUTES : le tri des ajouts manuels
 * est fait ici et compté à part (`manualExcludedLines`).
 */
export function computeRevenue(input: { lines: ConfirmedLineRow[]; previousLines: ConfirmedLineRow[] }): {
  revenue: RevenueStats;
  manualExcludedLines: number;
  unpricedConfirmedLines: number;
} {
  const counted = selectCountedLines(input.lines);
  const previousCounted = selectCountedLines(input.previousLines);

  const current = totalsOf(counted);
  const previous = totalsOf(previousCounted);

  const revenue: RevenueStats = {
    confirmedTtcCents: metric(current.revenueCents, previous.revenueCents),
    confirmedSales: metric(current.sales, previous.sales),
    pricedLines: current.pricedLines,
    unpricedLines: current.unpricedLines,
    unitsSold: current.units,
    averageBasketCents: averageBasket(current),
    previousAverageBasketCents: averageBasket(previous),
  };

  return {
    revenue,
    manualExcludedLines: input.lines.length - counted.length,
    unpricedConfirmedLines: current.unpricedLines,
  };
}
