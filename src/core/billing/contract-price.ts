/**
 * Tarif catalogue et tarif contractuel : deux prix qui ne se confondent jamais.
 *
 *   - le TARIF CATALOGUE est celui d'une offre (`Plan.monthlyPriceCents`) :
 *     il s'applique aux nouveaux abonnements, et seulement à eux ;
 *   - le TARIF CONTRACTUEL est celui d'une officine
 *     (`Subscription.contractPriceCents`) : figé à la souscription, d'après le
 *     contrat signé, il ne change que par une modification explicite, motivée
 *     et tracée (`SubscriptionPriceChange`).
 *
 * Exemple : un client signé à 290 € reste à 290 € quand le catalogue passe à
 * 349 €, tant que personne n'a modifié son tarif contractuel.
 */

export const MIN_CONTRACT_PRICE_CENTS = 100;
export const MAX_CONTRACT_PRICE_CENTS = 1_000_000;

export type PriceSource = "CONTRACT" | "CATALOG_FALLBACK";

/**
 * Le tarif d'un abonnement existant : son tarif contractuel ; à défaut (fiche
 * antérieure à la reprise des tarifs), celui de son offre, signalé comme tel.
 */
export function contractualPrice(subscription: { contractPriceCents: number | null }, plan: { monthlyPriceCents: number }): { cents: number; source: PriceSource } {
  if (subscription.contractPriceCents !== null && subscription.contractPriceCents !== undefined) return { cents: subscription.contractPriceCents, source: "CONTRACT" };
  return { cents: plan.monthlyPriceCents, source: "CATALOG_FALLBACK" };
}

/** Le catalogue a bougé depuis la souscription : l'écran le dit, sans rien changer. */
export function catalogDiffers(subscription: { contractPriceCents: number | null }, plan: { monthlyPriceCents: number }): boolean {
  return subscription.contractPriceCents !== null && subscription.contractPriceCents !== undefined && subscription.contractPriceCents !== plan.monthlyPriceCents;
}

/**
 * Le tarif à figer quand un abonnement naît : celui du contrat signé qui le
 * fonde ; sans contrat, le tarif catalogue du moment (qui devient alors son
 * tarif contractuel, et ne suivra plus le catalogue).
 */
export function initialContractPriceCents(input: { contractMonthlyPriceCents?: number | null; planMonthlyPriceCents: number }): number {
  const fromContract = input.contractMonthlyPriceCents;
  if (fromContract !== null && fromContract !== undefined && fromContract >= MIN_CONTRACT_PRICE_CENTS) return fromContract;
  return input.planMonthlyPriceCents;
}

/** Contrôle d'une modification de tarif contractuel : un nouveau montant réel et un motif. */
export function validateContractPriceChange(input: { previousCents: number | null; nextCents: number; reason: string }): { ok: true; reason: string } | { ok: false; error: string } {
  if (!Number.isInteger(input.nextCents) || input.nextCents < MIN_CONTRACT_PRICE_CENTS || input.nextCents > MAX_CONTRACT_PRICE_CENTS) {
    return { ok: false, error: "Indiquez un tarif mensuel entre 1 € et 10 000 € HT." };
  }
  if (input.previousCents === input.nextCents) return { ok: false, error: "Le nouveau tarif est identique au tarif actuel." };
  const reason = input.reason.replace(/\s+/g, " ").trim();
  if (reason.length < 5) return { ok: false, error: "Indiquez le motif de la modification (avenant signé, geste commercial…)." };
  if (reason.length > 500) return { ok: false, error: "Le motif est trop long (500 caractères au plus)." };
  return { ok: true, reason };
}

/**
 * Le MRR : la somme des tarifs contractuels des abonnements payants ou en
 * essai encore en cours, hors démonstration, hors résiliation programmée.
 */
export function mrrCents(rows: { status: string; contractPriceCents: number | null; planMonthlyPriceCents: number; cancelAtPeriodEnd: boolean; isDemo?: boolean }[], options: { includeTrials?: boolean } = {}): number {
  const counted = new Set(["ACTIVE", "PAST_DUE", ...(options.includeTrials ? ["TRIALING"] : [])]);
  return rows
    .filter((row) => counted.has(row.status) && !row.cancelAtPeriodEnd && !row.isDemo)
    .reduce((sum, row) => sum + contractualPrice({ contractPriceCents: row.contractPriceCents }, { monthlyPriceCents: row.planMonthlyPriceCents }).cents, 0);
}
