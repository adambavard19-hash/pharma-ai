import { monthBoundsFor, zonedDateParts } from "@/core/performance/periods";
import { AFFILIATE_MAX_RATE_LABEL, AFFILIATE_RATE_LABEL, AFFILIATE_RECURRING_RATE, monthlyAffiliateCommissionCents } from "./terms";

/**
 * La commission mensuelle d'affiliation, en règles pures et testées.
 *
 * Chaque mois civil (heure de Paris), pour chaque pharmacie apportée par un affilié et encore abonnée à la fin de ce
 * mois, l'affilié touche le taux de son palier (10 à 20 %, selon le nombre de ses pharmacies actives à la fin du mois,
 * `terms.ts`) de son abonnement mensuel HT. Le mois commissionné est le mois ÉCOULÉ : le
 * passage du 1er novembre crée les commissions d'octobre, et un passage manqué est rattrapé les jours suivants, jamais
 * au-delà du mois écoulé (aucune rétroactivité).
 */

export const AFFILIATION_TIME_ZONE = "Europe/Paris";

/** La phrase de la règle, la même partout (extranet, console, espace du directeur). */
export const AFFILIATE_RULE_SENTENCE = `de ${AFFILIATE_RATE_LABEL} à ${AFFILIATE_MAX_RATE_LABEL} de l'abonnement de chaque pharmacie, chaque mois, à vie, selon le nombre de pharmacies apportées`;

export type MonthPeriod = { key: string; label: string; start: Date; end: Date };

/** Le mois civil (Paris) qui contient `at` : « 2026-10 », « octobre 2026 », début inclus, fin exclue. */
export function monthPeriodOf(at: Date, timeZone = AFFILIATION_TIME_ZONE): MonthPeriod {
  const bounds = monthBoundsFor(at, timeZone);
  const { year, month } = zonedDateParts(bounds.start, timeZone);
  return { key: `${year}-${String(month).padStart(2, "0")}`, label: bounds.label, start: bounds.start, end: bounds.end };
}

/** Le mois écoulé, celui que commissionne un passage fait à l'instant `now`. */
export function previousMonthPeriod(now: Date, timeZone = AFFILIATION_TIME_ZONE): MonthPeriod {
  const current = monthBoundsFor(now, timeZone);
  // Douze heures avant le début du mois courant : un instant du mois précédent, quel que soit le changement d'heure.
  return monthPeriodOf(new Date(current.start.getTime() - 12 * 3_600_000), timeZone);
}

/** « 2026-10 » → « octobre 2026 » (pour l'écran ; une clé illisible est rendue telle quelle). */
export function monthLabelOf(key: string | null | undefined): string {
  if (!key) return "";
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  // Le 15 à midi UTC : toujours dans le bon mois à Paris.
  return monthPeriodOf(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 15, 12))).label;
}

/** Ce que la règle lit de l'abonnement d'une pharmacie. */
export type SubscriptionFacts = {
  status: string;
  createdAt: Date;
  trialEndsAt: Date | null;
  endedAt: Date | null;
  canceledAt: Date | null;
  contractPriceCents: number | null;
  referralDiscountCents: number | null;
  plan: { monthlyPriceCents: number };
};

/**
 * La pharmacie était-elle ABONNÉE (abonnement payant en cours) à la fin du mois ?
 *
 * - l'abonnement existait avant la fin du mois, et son essai gratuit était terminé avant cette fin ;
 * - il est actif aujourd'hui (ACTIVE), ou il s'est arrêté APRÈS la fin du mois (résiliation effective ensuite).
 *
 * Tout autre état (essai, impayé, suspendu, en pause, incomplet, résilié pendant ou avant le mois) : pas de commission.
 * En cas de doute, rien : une commission se crée, elle ne se reprend pas.
 */
export function subscribedAtMonthEnd(subscription: SubscriptionFacts | null, period: Pick<MonthPeriod, "end">): boolean {
  if (!subscription) return false;
  if (subscription.createdAt >= period.end) return false;
  if (subscription.trialEndsAt && subscription.trialEndsAt >= period.end) return false;
  if (subscription.status === "ACTIVE") return true;
  const stoppedAt = subscription.endedAt ?? subscription.canceledAt;
  return subscription.status === "CANCELED" && stoppedAt !== null && stoppedAt >= period.end;
}

/**
 * L'abonnement mensuel HT réellement facturé à la pharmacie : son tarif contractuel figé (à défaut, le prix de son
 * offre), moins la remise de parrainage qu'elle reçoit. Jamais négatif.
 */
export function monthlySubscriptionCents(subscription: Pick<SubscriptionFacts, "contractPriceCents" | "referralDiscountCents" | "plan">): number {
  const price = subscription.contractPriceCents ?? subscription.plan.monthlyPriceCents;
  return Math.max(0, price - Math.max(0, subscription.referralDiscountCents ?? 0));
}

/**
 * La commission du mois pour une pharmacie : le taux du palier de l'affilié (`affiliateRateFor`, 10 % par défaut) de son
 * abonnement mensuel HT, ou rien si elle n'était pas abonnée.
 */
export function affiliateCommissionForMonth(subscription: SubscriptionFacts | null, period: Pick<MonthPeriod, "end">, rate: number = AFFILIATE_RECURRING_RATE): number {
  if (!subscription || !subscribedAtMonthEnd(subscription, period)) return 0;
  return monthlyAffiliateCommissionCents(monthlySubscriptionCents(subscription), rate);
}

/** Les règles de l'ancienne rémunération (une somme par pharmacie) : une pharmacie déjà payée ainsi n'ouvre pas, en plus, la commission mensuelle. */
export const ONE_OFF_COMMISSION_TYPES = ["FIXED", "PERCENT", "RECURRING", "PROGRESSIVE"] as const;

// ---------------------------------------------------------------- Primes uniques

/**
 * Le début du programme d'affiliation (18 oct. 2026, minuit à Paris). Les primes uniques ne valent que pour une mise en
 * service réglée à partir de cet instant : aucune prime rétroactive pour les pharmacies d'avant.
 */
export const AFFILIATION_PROGRAM_START = new Date("2026-10-17T22:00:00.000Z");

/** La clé de la prime unique de l'affilié dans `Commission.periodMonth` : l'index unique (dossier, clé) n'en laisse qu'une. */
export const SIGNUP_BONUS_KEY = "PRIME";

export type PaymentFacts = { status: string; paidAt: Date | null; amountCents: number };

/**
 * Quand la mise en service a-t-elle été RÉELLEMENT réglée ? Elle est facturée sur la première facture de l'abonnement
 * (`Subscription.setupFeeCents`) : c'est le premier paiement encaissé (PAID, date de paiement connue) d'un montant au
 * moins égal à la mise en service. Mise en service offerte (0) ou inconnue (vide) : jamais réglée, donc aucune prime.
 */
export function setupPaidAt(setupFeeCents: number | null, payments: PaymentFacts[]): Date | null {
  if (!setupFeeCents || setupFeeCents <= 0) return null;
  const paid = payments.filter((payment) => payment.status === "PAID" && payment.paidAt !== null && payment.amountCents >= setupFeeCents).map((payment) => payment.paidAt!.getTime());
  return paid.length > 0 ? new Date(Math.min(...paid)) : null;
}

/** La prime est-elle due ? Mise en service réglée, et réglée depuis le début du programme. */
export function signupBonusDue(setupFeeCents: number | null, payments: PaymentFacts[]): boolean {
  const at = setupPaidAt(setupFeeCents, payments);
  return at !== null && at >= AFFILIATION_PROGRAM_START;
}
