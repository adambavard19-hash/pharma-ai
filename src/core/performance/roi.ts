import { ROI_MIN_PRICED_LINES, ROI_MIN_PRICED_SHARE, SUBSCRIPTION_VAT_RATE } from "./definitions";
import type { ConfirmedLineRow, SubscriptionInfo, SubscriptionReturn, SubscriptionReturnHiddenReason } from "./types";

/**
 * « Mon abonnement me coûte X €, PharmaBoost m'a permis d'attribuer X € de
 * ventes ce mois-ci. »
 *
 * Le retour sur abonnement ne s'affiche que s'il repose sur des faits solides :
 * un abonnement qui est celui de CETTE officine seule, un prix de contrat connu,
 * assez de lignes de vente confirmées, presque toutes au prix saisi. Dans le
 * doute il reste masqué, avec sa raison : jamais un ratio douteux. C'est du
 * chiffre d'affaires hors taxes, jamais un bénéfice.
 */

/** Les statuts d'abonnement dont le prix mensuel sert de référence. */
export const ROI_SUBSCRIPTION_STATUSES: readonly string[] = ["ACTIVE", "TRIALING", "PAST_DUE"];

/** Pourquoi un abonnement partagé masque le retour : dit tel quel à l'écran. */
export const SHARED_SUBSCRIPTION_DETAIL =
  "Cet abonnement couvre plusieurs officines : le chiffre d'affaires d'une seule ne se compare pas au prix du groupe.";

/**
 * Le prix mensuel HT du contrat, ou `null` quand il n'existe pas : pas
 * d'abonnement en cours (statut hors liste), abonnement partagé entre plusieurs
 * officines (son prix est celui du groupe, pas celui d'une officine) ou prix
 * absent / nul. Un prix `null` désactive aussi, au portefeuille, la règle
 * « forte valeur » sans retour affiché.
 */
export function returnSubscriptionPrice(subscription: SubscriptionInfo | null): number | null {
  if (!subscription || !ROI_SUBSCRIPTION_STATUSES.includes(subscription.status)) return null;
  if (subscription.shared === true) return null;
  const price = subscription.monthlyPriceHtCents;
  return price !== null && Number.isFinite(price) && price > 0 ? price : null;
}

function hidden(reason: SubscriptionReturnHiddenReason, detail: string): SubscriptionReturn {
  return { status: "hidden", reason, detail };
}

/**
 * Le ratio, avec une décimale et la virgule française. Au-dessus de 1 on arrondit
 * au plus proche ; en dessous de 1 on ne montre jamais « 1,0 fois » : « 0,9 fois »
 * plutôt qu'un arrondi flatteur.
 */
function ratioLabelOf(value: number): string {
  let rounded = Math.round(value * 10) / 10;
  if (value < 1 && rounded >= 1) rounded = 0.9;
  return `${rounded.toFixed(1).replace(".", ",")} fois`;
}

/**
 * Le taux de TVA d'une ligne. Un taux absent ou absurde (impossible avec le
 * schéma, mais on ne propage jamais NaN) retombe sur le taux normal : le HT
 * est alors le plus bas possible, le ratio n'est jamais flatté.
 */
function vatOf(line: ConfirmedLineRow): number {
  return Number.isFinite(line.vatRate) && line.vatRate >= 0 ? line.vatRate : SUBSCRIPTION_VAT_RATE;
}

/**
 * Le retour sur abonnement du MOIS CIVIL en cours (indépendant du sélecteur de
 * période). `monthLines` : les lignes de vente confirmées datées du mois ;
 * `now` fait partie du contrat mais le mois est déjà borné par l'appelant.
 *
 * Les raisons de masquage, dans l'ordre où elles sont examinées :
 *  1. `no_subscription` : pas d'abonnement en cours ;
 *  2. `shared_subscription` : l'abonnement couvre plusieurs officines actives ;
 *  3. `no_price` : prix mensuel HT inconnu ou nul ;
 *  4. `no_data` : aucune ligne confirmée dans le mois ;
 *  5. `not_enough_sales` : moins de 5 lignes de vente confirmées au prix connu ;
 *  6. `prices_unreliable` : moins de 90 % des lignes de vente confirmées ont un prix connu.
 */
export function computeSubscriptionReturn(input: {
  subscription: SubscriptionInfo | null;
  monthLines: ConfirmedLineRow[];
  monthLabel: string;
  now: Date;
}): SubscriptionReturn {
  const { subscription, monthLabel } = input;

  if (!subscription || !ROI_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    return hidden("no_subscription", "Aucun abonnement en cours n'est enregistré pour cette officine.");
  }
  // Un abonnement de groupe se compare au chiffre d'affaires du groupe, jamais à celui d'une seule officine.
  if (subscription.shared === true) return hidden("shared_subscription", SHARED_SUBSCRIPTION_DETAIL);
  const monthlyPriceHtCents = returnSubscriptionPrice(subscription);
  if (monthlyPriceHtCents === null) {
    return hidden("no_price", "Le prix mensuel de l'abonnement n'est pas renseigné : le retour ne peut pas être calculé.");
  }

  // Un produit ajouté à la main n'est pas un conseil PharmaBoost : jamais dans le retour.
  const lines = input.monthLines.filter((line) => line.origin !== "MANUAL");
  if (lines.length === 0) {
    return hidden("no_data", "Le retour s'affichera dès qu'une vente confirmée, issue d'un conseil PharmaBoost, sera enregistrée ce mois-ci.");
  }

  // Une ligne de vente au prix 0 n'est jamais du chiffre d'affaires.
  const priced = lines.filter((line) => line.unitPriceCents > 0);
  if (priced.length < ROI_MIN_PRICED_LINES) {
    return hidden(
      "not_enough_sales",
      `Le retour s'affichera dès que ${ROI_MIN_PRICED_LINES} lignes de vente confirmées au prix connu auront été enregistrées ce mois-ci (${priced.length} pour l'instant).`,
    );
  }
  const pricedShare = priced.length / lines.length;
  if (pricedShare < ROI_MIN_PRICED_SHARE) {
    return hidden(
      "prices_unreliable",
      // `floor` exprès : sous le seuil, 89,6 % ne s'écrit jamais « 90 % » (le texte se contredirait).
      // Le 1e-9 absorbe la dérive des flottants (0,29 × 100 = 28,999… ne doit pas s'écrire 28 %).
      `Le retour s'affichera dès que ${Math.round(ROI_MIN_PRICED_SHARE * 100)} % des lignes de vente confirmées du mois auront un prix renseigné (${Math.floor(pricedShare * 100 + 1e-9)} % pour l'instant).`,
    );
  }

  const confirmedTtcCents = priced.reduce((sum, line) => sum + line.totalCents, 0);
  // Chaque ligne est ramenée hors taxes avec SON taux ; on n'arrondit qu'une fois,
  // à la fin, pour ne pas cumuler des centimes de dérive ligne après ligne.
  const confirmedHtCents = Math.round(priced.reduce((sum, line) => sum + (line.totalCents * 100) / (100 + vatOf(line)), 0));

  const ratioValue = confirmedHtCents / monthlyPriceHtCents;
  const ratioLabel = ratioLabelOf(ratioValue);
  const trialing = subscription.status === "TRIALING";
  const subscriptionWords = trialing ? "votre abonnement après essai" : "votre abonnement";

  return {
    status: "shown",
    monthLabel,
    monthlyPriceHtCents,
    trialing,
    confirmedTtcCents,
    confirmedHtCents,
    // Les lignes au prix connu : celles qui font le chiffre d'affaires ci-dessus.
    confirmedLines: priced.length,
    pricedShare,
    ratio: ratioValue,
    ratioLabel,
    sentence: `PharmaBoost a généré ${ratioLabel} le montant de ${subscriptionWords} en ventes confirmées ce mois-ci (chiffre d'affaires HT, pas bénéfice).`,
  };
}
