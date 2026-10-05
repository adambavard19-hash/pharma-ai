/**
 * L'offre officielle de PharmaBoost : la SEULE source des montants affichés
 * quand la console n'a pas publié sa propre offre.
 *
 * Deux formules, un même abonnement par officine, tous les postes inclus :
 *   - mensuelle : 99 € HT par mois, sans engagement, mise en service de 390 € HT
 *     facturée une seule fois ;
 *   - annuelle : 1 188 € HT par an, engagement de 12 mois, mise en service offerte.
 * Et la commission standard d'un commercial : 250 € par nouvelle pharmacie activée.
 *
 * Ce sont des tarifs de CATALOGUE. Le prix qu'une officine paie est celui de son
 * contrat (`Subscription.contractPriceCents`), figé à la souscription : changer
 * ici, ou dans la console, ne modifie jamais le prix d'une officine déjà cliente.
 */
export const OFFICIAL_OFFER = {
  code: "PHARMABOOST_OFFICINE",
  name: "PharmaBoost Officine",
  monthly: { priceCents: 9_900, setupFeeCents: 39_000 },
  annual: { priceCents: 118_800, setupFeeCents: 0, commitmentMonths: 12 },
  /** Commission standard d'un commercial, par nouvelle pharmacie activée, quelle que soit sa taille. */
  standardCommissionCents: 25_000,
} as const;

/** Les formules que le visiteur peut choisir sur le site. */
export const SUBSCRIPTION_FORMULAS = ["MONTHLY", "ANNUAL"] as const;
export type SubscriptionFormula = (typeof SUBSCRIPTION_FORMULAS)[number];

export const FORMULA_LABELS: Record<SubscriptionFormula, string> = { MONTHLY: "Formule mensuelle", ANNUAL: "Formule annuelle" };

/** Dans l'adresse du site : `?formule=mensuelle` ou `?formule=annuelle`. */
export function parseFormula(value: string | null | undefined): SubscriptionFormula | null {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "mensuelle" || v === "monthly") return "MONTHLY";
  if (v === "annuelle" || v === "annual") return "ANNUAL";
  return null;
}

export function formulaQuery(formula: SubscriptionFormula): string {
  return formula === "ANNUAL" ? "annuelle" : "mensuelle";
}

/** Ce que le site affiche. Tout montant est en centimes HT. */
export type PublicPricing = {
  name: string;
  /** PLAN : l'offre par défaut publiée dans la console. OFFICIAL_DEFAULT : les valeurs officielles ci-dessus. */
  source: "PLAN" | "OFFICIAL_DEFAULT";
  monthly: { priceCents: number; setupFeeCents: number };
  annual: { priceCents: number; setupFeeCents: number; commitmentMonths: number; monthlyEquivalentCents: number };
};

export type PricingPlanInput = {
  name: string;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  setupFeeCents: number | null;
  annualSetupFeeCents: number | null;
};

const isAmount = (value: number | null | undefined): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * L'offre à afficher : celle de la console quand elle est COMPLÈTE (prix
 * mensuel, prix annuel, et les deux mises en service renseignées), sinon
 * l'offre officielle d'un bloc. Jamais un mélange des deux : un visiteur ne doit
 * pas voir un prix de la console avec une mise en service du code.
 */
export function resolvePublicPricing(plan: PricingPlanInput | null | undefined): PublicPricing {
  const complete = plan && isAmount(plan.monthlyPriceCents) && plan.monthlyPriceCents > 0 && isAmount(plan.annualPriceCents) && plan.annualPriceCents > 0 && isAmount(plan.setupFeeCents) && isAmount(plan.annualSetupFeeCents);
  const monthly = complete ? { priceCents: plan.monthlyPriceCents, setupFeeCents: plan.setupFeeCents as number } : { ...OFFICIAL_OFFER.monthly };
  const annualPrice = complete ? (plan.annualPriceCents as number) : OFFICIAL_OFFER.annual.priceCents;
  const annualSetup = complete ? (plan.annualSetupFeeCents as number) : OFFICIAL_OFFER.annual.setupFeeCents;
  return {
    name: complete ? plan.name : OFFICIAL_OFFER.name,
    source: complete ? "PLAN" : "OFFICIAL_DEFAULT",
    monthly,
    annual: {
      priceCents: annualPrice,
      setupFeeCents: annualSetup,
      commitmentMonths: OFFICIAL_OFFER.annual.commitmentMonths,
      monthlyEquivalentCents: Math.round(annualPrice / OFFICIAL_OFFER.annual.commitmentMonths),
    },
  };
}

/** Pourquoi le site n'affiche pas l'offre de la console : à dire à l'administrateur, jamais au visiteur. */
export function pricingPlanGaps(plan: PricingPlanInput | null | undefined): string[] {
  if (!plan) return ["Aucune offre par défaut n'est publiée dans la console : le site affiche l'offre officielle."];
  const gaps: string[] = [];
  if (!isAmount(plan.annualPriceCents) || plan.annualPriceCents <= 0) gaps.push("le prix annuel");
  if (!isAmount(plan.setupFeeCents)) gaps.push("la mise en service mensuelle");
  if (!isAmount(plan.annualSetupFeeCents)) gaps.push("la mise en service annuelle (0 = offerte)");
  return gaps.length ? [`L'offre par défaut « ${plan.name} » est incomplète (${gaps.join(", ")}) : le site affiche l'offre officielle.`] : [];
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

/** « 99 € », « 1 188 € », « 12,50 € » : espaces insécables, virgule française, sans décimales inutiles. */
export function formatPriceEuros(cents: number): string {
  const euros = cents / 100;
  const text = Number.isInteger(euros) ? euros.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : euros.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text.replace(/[   ]/g, " ")} €`;
}
