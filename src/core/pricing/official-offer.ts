/**
 * L'offre officielle de PharmaBoost : la SEULE source des montants affichés
 * quand la console n'a pas publié sa propre offre.
 *
 * Un seul abonnement par officine, engagement de 12 mois :
 *   - 126 € HT par mois ;
 *   - une mise en service unique de 290 € HT : installation et configuration sur
 *     tous les postes de comptoir, paramétrage de l'officine et import du stock,
 *     tests de fonctionnement, formation de l'équipe ;
 *   - parrainage : dès que la personne parrainée s'abonne, l'abonnement de
 *     l'officine qui parraine passe à 20 % de moins par mois.
 * Et la commission standard d'un commercial : 250 € par nouvelle pharmacie activée.
 *
 * Ce sont des tarifs de CATALOGUE. Le prix qu'une officine paie est celui de son
 * contrat (`Subscription.contractPriceCents`), figé à la souscription : changer
 * ici, ou dans la console, ne modifie jamais le prix d'une officine déjà cliente.
 */
export const OFFICIAL_OFFER = {
  code: "PHARMABOOST_OFFICINE",
  name: "PharmaBoost Officine",
  monthlyPriceCents: 12_600,
  setupFeeCents: 29_000,
  commitmentMonths: 12,
  referralDiscountPercent: 20,
  /** Commission standard d'un commercial, par nouvelle pharmacie activée, quelle que soit sa taille. */
  standardCommissionCents: 25_000,
} as const;

/** Ce que le site affiche. Tout montant est en centimes HT. */
export type PublicPricing = {
  name: string;
  /** PLAN : l'offre par défaut publiée dans la console. OFFICIAL_DEFAULT : les valeurs officielles ci-dessus. */
  source: "PLAN" | "OFFICIAL_DEFAULT";
  monthlyPriceCents: number;
  setupFeeCents: number;
  commitmentMonths: number;
  referralDiscountPercent: number;
};

export type PricingPlanInput = {
  name: string;
  monthlyPriceCents: number;
  setupFeeCents: number | null;
};

const isAmount = (value: number | null | undefined): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * L'offre à afficher : celle de la console quand elle est COMPLÈTE (prix mensuel
 * et mise en service renseignés), sinon l'offre officielle d'un bloc. Jamais un
 * mélange : un visiteur ne doit pas voir un prix de la console avec une mise en
 * service du code. L'engagement et le parrainage sont ceux de l'offre officielle.
 */
export function resolvePublicPricing(plan: PricingPlanInput | null | undefined): PublicPricing {
  const complete = plan && isAmount(plan.monthlyPriceCents) && plan.monthlyPriceCents > 0 && isAmount(plan.setupFeeCents);
  return {
    name: complete ? plan.name : OFFICIAL_OFFER.name,
    source: complete ? "PLAN" : "OFFICIAL_DEFAULT",
    monthlyPriceCents: complete ? plan.monthlyPriceCents : OFFICIAL_OFFER.monthlyPriceCents,
    setupFeeCents: complete ? (plan.setupFeeCents as number) : OFFICIAL_OFFER.setupFeeCents,
    commitmentMonths: OFFICIAL_OFFER.commitmentMonths,
    referralDiscountPercent: OFFICIAL_OFFER.referralDiscountPercent,
  };
}

/** Pourquoi le site n'affiche pas l'offre de la console : à dire à l'administrateur, jamais au visiteur. */
export function pricingPlanGaps(plan: PricingPlanInput | null | undefined): string[] {
  if (!plan) return ["Aucune offre par défaut n'est publiée dans la console : le site affiche l'offre officielle."];
  const gaps: string[] = [];
  if (!isAmount(plan.setupFeeCents)) gaps.push("la mise en service");
  return gaps.length ? [`L'offre par défaut « ${plan.name} » est incomplète (${gaps.join(", ")}) : le site affiche l'offre officielle.`] : [];
}

/** Le prix mensuel d'une officine qui parraine, une fois la personne parrainée abonnée : 126 € moins 20 % = 100,80 €. */
export function referrerPriceCents(monthlyPriceCents: number, discountPercent: number = OFFICIAL_OFFER.referralDiscountPercent): number {
  return Math.round((monthlyPriceCents * (100 - discountPercent)) / 100);
}

// ---------------------------------------------------------------- Commission standard

/** La clé du réglage de la console : `{ amountCents }`. */
export const STANDARD_COMMISSION_KEY = "sales.standard_commission";
/** Garde-fou contre une faute de frappe : au plus 5 000 € par pharmacie activée. */
export const STANDARD_COMMISSION_MAX_CENTS = 500_000;

/** Le réglage stocké, ramené à une valeur sûre ; à défaut, la commission officielle. */
export function resolveStandardCommissionCents(stored: unknown): number {
  const amount = stored && typeof stored === "object" ? (stored as { amountCents?: unknown }).amountCents : undefined;
  return typeof amount === "number" && Number.isInteger(amount) && amount > 0 && amount <= STANDARD_COMMISSION_MAX_CENTS ? amount : OFFICIAL_OFFER.standardCommissionCents;
}

// ---------------------------------------------------------------- Affichage

/** « 126 € », « 5 000 € », « 100,80 € » : espaces insécables, virgule française, sans décimales inutiles. */
export function formatPriceEuros(cents: number): string {
  const euros = cents / 100;
  const text = Number.isInteger(euros) ? euros.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : euros.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text.replace(/[   ]/g, " ")} €`;
}
