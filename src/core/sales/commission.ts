import { BONUS_TIERS, COMMISSION_TIERS, rateForRank } from "./progressive-commission";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { AFFILIATE_RULE_SENTENCE } from "@/core/affiliation/monthly";

/**
 * Le calcul d'une commission, pur et testé.
 *
 * PROGRESSIVE : la grille progressive (`progressive-commission.ts`) ; le montant
 *           dépend du RANG de la pharmacie dans les activations du commercial,
 *           fourni par l'appelant (à défaut : la première tranche).
 * FIXED : un montant en centimes par contrat finalisé.
 * PERCENT : un pourcentage (en centièmes de pour cent) du prix mensuel HT de
 *           l'abonnement, sur la première année (12 mois).
 * RECURRING : un montant mensuel en centimes ; la commission créée à la
 *             signature porte les 12 premiers mois, le suivi des suivantes
 *             relève de la comptabilité.
 * BONUS : le type d'une ligne de bonus de palier, jamais la règle d'un
 *         commercial ; aucun contrat ne le calcule (0).
 * AFFILIATE : l'affiliation (18 oct. 2026) — 10 % de l'abonnement mensuel de
 *         chaque pharmacie apportée, chaque mois, à vie. Rien n'est dû au
 *         contrat (0) : les commissions naissent chaque mois
 *         (`server/services/sales/affiliate-commissions.ts`).
 */
export type CommissionRule = { type: "FIXED" | "PERCENT" | "RECURRING" | "PROGRESSIVE" | "BONUS" | "AFFILIATE" | "AFFILIATE_SIGNUP"; value: number };

export function computeCommissionCents(rule: CommissionRule, contract: { monthlyPriceCents: number; durationMonths: number }, context?: { rank?: number }): number {
  const months = Math.min(12, Math.max(1, contract.durationMonths || 12));
  switch (rule.type) {
    case "PROGRESSIVE":
      return rateForRank(Math.max(1, context?.rank ?? 1));
    case "FIXED":
      return Math.max(0, Math.round(rule.value));
    case "PERCENT":
      return Math.max(0, Math.round((contract.monthlyPriceCents * months * rule.value) / 10_000));
    case "RECURRING":
      return Math.max(0, Math.round(rule.value * months));
    case "BONUS":
    case "AFFILIATE":
    case "AFFILIATE_SIGNUP":
      return 0;
  }
}

/** « 200 € à 300 € par pharmacie activée, + bonus de palier » : la grille en une ligne. */
export function describeProgressiveGrid(): string {
  const first = COMMISSION_TIERS[0].rateCents;
  const last = COMMISSION_TIERS[COMMISSION_TIERS.length - 1].rateCents;
  return `Grille progressive : ${formatPriceEuros(first)} à ${formatPriceEuros(last)} par pharmacie activée, + bonus de palier (${BONUS_TIERS.map((bonus) => bonus.at).join(", ")})`;
}

/** « 12,5 % » · « 300,00 € » · « 25,00 € / mois » — pour l'écran, jamais pour le calcul. */
export function describeCommissionRule(rule: CommissionRule): string {
  const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
  switch (rule.type) {
    case "PROGRESSIVE":
      return describeProgressiveGrid();
    case "FIXED":
      return `${euros(rule.value)} par contrat`;
    case "PERCENT":
      return `${(rule.value / 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} % de la première année`;
    case "RECURRING":
      return `${euros(rule.value)} par mois, 12 mois`;
    case "BONUS":
      return "Bonus de palier";
    case "AFFILIATE_SIGNUP":
      return "Prime d'arrivée";
    case "AFFILIATE":
      return AFFILIATE_RULE_SENTENCE.charAt(0).toUpperCase() + AFFILIATE_RULE_SENTENCE.slice(1);
  }
}
