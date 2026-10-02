import type { ContractType } from "./status";

/**
 * Estimation INDICATIVE de ce qu'un contrat partenaire rapporterait sur un
 * volume attribué. Rien n'est facturé : la console l'affiche pour préparer la
 * discussion commerciale, la facturation réelle viendra plus tard.
 *
 * Modèles : forfait, pourcentage, par unité, hybride (forfait + variable),
 * pilote et gratuit (zéro). Un minimum contractuel relève le variable.
 */

export type ContractTerms = {
  type: ContractType;
  fixedAmountCents: number | null;
  commissionPercent: number | null;
  commissionPerUnitCents: number | null;
  minimumCents: number | null;
};

export type AttributedVolume = {
  /** Montant HT des commandes attribuées sur la période. */
  amountCents: number;
  /** Unités commandées sur la période. */
  units: number;
};

export type CommissionEstimate = { fixedCents: number; variableCents: number; totalCents: number; note: string };

const cents = (value: number | null) => (value !== null && Number.isFinite(value) && value > 0 ? value : 0);

export function estimateCommission(terms: ContractTerms, volume: AttributedVolume): CommissionEstimate {
  if (terms.type === "PILOT" || terms.type === "FREE") {
    return { fixedCents: 0, variableCents: 0, totalCents: 0, note: terms.type === "PILOT" ? "Pilote : aucune rémunération" : "Gratuit : aucune rémunération" };
  }
  const fixed = terms.type === "FLAT_FEE" || terms.type === "HYBRID" ? Math.round(cents(terms.fixedAmountCents)) : 0;
  let variable = 0;
  if (terms.type === "COMMISSION" || terms.type === "HYBRID") {
    const percent = cents(terms.commissionPercent);
    variable = Math.round((Math.max(0, volume.amountCents) * percent) / 100) + Math.round(cents(terms.commissionPerUnitCents) * Math.max(0, volume.units));
    const minimum = cents(terms.minimumCents);
    if (variable < minimum) variable = Math.round(minimum);
  }
  return { fixedCents: fixed, variableCents: variable, totalCents: fixed + variable, note: "Estimation indicative, non facturée" };
}
