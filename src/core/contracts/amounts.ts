import { OFFICIAL_OFFER } from "@/core/pricing/official-offer";

/**
 * Les montants imprimés au contrat d'abonnement d'une pharmacie : jamais
 * écrits en dur dans le modèle. L'ordre de lecture :
 *   - tarif mensuel : celui retenu au dossier (ajusté par un commercial), sinon l'offre de la console, sinon l'offre officielle ;
 *   - mise en service : celle de l'offre de la console quand elle est renseignée, sinon l'offre officielle ;
 *   - engagement : celui demandé, sinon l'engagement de l'offre officielle.
 */
export type ContractAmounts = { monthlyPriceCents: number; setupFeeCents: number; durationMonths: number; source: "PLAN" | "OFFICIAL" };

const amount = (value: number | null | undefined): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

export function resolveContractAmounts(
  plan: { monthlyPriceCents: number; setupFeeCents: number | null } | null | undefined,
  overrides: { monthlyPriceCents?: number | null; durationMonths?: number | null } = {},
): ContractAmounts {
  const monthly = amount(overrides.monthlyPriceCents) && overrides.monthlyPriceCents > 0 ? overrides.monthlyPriceCents : plan && plan.monthlyPriceCents > 0 ? plan.monthlyPriceCents : OFFICIAL_OFFER.monthlyPriceCents;
  return {
    monthlyPriceCents: monthly,
    setupFeeCents: plan && amount(plan.setupFeeCents) ? plan.setupFeeCents : OFFICIAL_OFFER.setupFeeCents,
    durationMonths: overrides.durationMonths && overrides.durationMonths > 0 ? overrides.durationMonths : OFFICIAL_OFFER.commitmentMonths,
    source: plan ? "PLAN" : "OFFICIAL",
  };
}
