/**
 * Le calcul d'une commission, pur et testé.
 *
 * FIXED : un montant en centimes par contrat finalisé.
 * PERCENT : un pourcentage (en centièmes de pour cent) du prix mensuel HT de
 *           l'abonnement, sur la première année (12 mois).
 * RECURRING : un montant mensuel en centimes ; la commission créée à la
 *             signature porte les 12 premiers mois, le suivi des suivantes
 *             relève de la comptabilité.
 */
export type CommissionRule = { type: "FIXED" | "PERCENT" | "RECURRING"; value: number };

export function computeCommissionCents(rule: CommissionRule, contract: { monthlyPriceCents: number; durationMonths: number }): number {
  const months = Math.min(12, Math.max(1, contract.durationMonths || 12));
  switch (rule.type) {
    case "FIXED":
      return Math.max(0, Math.round(rule.value));
    case "PERCENT":
      return Math.max(0, Math.round((contract.monthlyPriceCents * months * rule.value) / 10_000));
    case "RECURRING":
      return Math.max(0, Math.round(rule.value * months));
  }
}

/** « 12,5 % » · « 300,00 € » · « 25,00 € / mois » — pour l'écran, jamais pour le calcul. */
export function describeCommissionRule(rule: CommissionRule): string {
  const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
  switch (rule.type) {
    case "FIXED":
      return `${euros(rule.value)} par contrat`;
    case "PERCENT":
      return `${(rule.value / 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} % de la première année`;
    case "RECURRING":
      return `${euros(rule.value)} par mois, 12 mois`;
  }
}
