/**
 * L'estimation que le site propose à l'officine : combien de chiffre d'affaires
 * supplémentaire PharmaBoost peut lui rapporter par mois.
 *
 * Le raisonnement tient en quatre lignes, dites telles quelles au visiteur :
 *   - 10 % de ses clients se voient proposer, et prennent, un produit conseillé ;
 *   - à 10 € le produit en moyenne ;
 *   - sur 25 jours d'ouverture par mois.
 * 200 clients par jour : 20 clients conseillés, 20 × 10 € = 200 € par jour,
 * × 25 jours = 5 000 € par mois.
 *
 * C'est une ESTIMATION indicative, pas une promesse : elle ne dit rien de la
 * marge, et ses trois hypothèses sont celles de PharmaBoost, affichées à côté.
 */
export const ESTIMATE_ASSUMPTIONS = {
  /** Part des clients qui prennent un produit conseillé. */
  adviceRate: 0.1,
  /** Prix moyen d'un produit conseillé, en centimes. */
  averageProductCents: 1_000,
  /** Jours d'ouverture de la pharmacie par mois. */
  openDaysPerMonth: 25,
} as const;

/** Au-delà, la saisie est ramenée à cette valeur : une pharmacie ne sert pas plus de clients par jour. */
export const MAX_CLIENTS_PER_DAY = 3_000;

export type RevenueEstimate = {
  /** La valeur retenue, entière, bornée. */
  clientsPerDay: number;
  /** Clients conseillés par jour (10 %, arrondi à l'entier le plus proche). */
  advisedClientsPerDay: number;
  /** Chiffre d'affaires supplémentaire par jour, en centimes. */
  perDayCents: number;
  /** Chiffre d'affaires supplémentaire par mois, en centimes. */
  perMonthCents: number;
};

/** « 200 », « 1 200 », « 200,0 » → 200 ; une saisie vide ou illisible → null (rien n'est deviné). */
export function parseClientsPerDay(input: string): number | null {
  const cleaned = input.replace(/[\s  ]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.min(MAX_CLIENTS_PER_DAY, Math.round(value));
}

/** Le calcul, en nombres entiers à chaque étape : ce qui s'affiche se refait à la calculette. */
export function estimateAdditionalRevenue(clientsPerDay: number): RevenueEstimate {
  const clients = Math.min(MAX_CLIENTS_PER_DAY, Math.max(0, Math.round(clientsPerDay)));
  const advised = Math.round(clients * ESTIMATE_ASSUMPTIONS.adviceRate);
  const perDayCents = advised * ESTIMATE_ASSUMPTIONS.averageProductCents;
  return { clientsPerDay: clients, advisedClientsPerDay: advised, perDayCents, perMonthCents: perDayCents * ESTIMATE_ASSUMPTIONS.openDaysPerMonth };
}
