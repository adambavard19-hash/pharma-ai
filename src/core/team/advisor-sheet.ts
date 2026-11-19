/**
 * La fiche « Conseiller certifié PharmaBoost » (fondateur, 19 nov. 2026) : le CV chiffré d'un collaborateur, qu'il télécharge
 * quand il veut et qui évolue avec lui — ventes, conseils proposés et vendus, taux, domaines où il conseille le plus, avis des
 * patients, niveau. Jamais un montant (règle : aucun montant pour l'équipe), jamais un patient.
 *
 * Module pur : aucune base, aucun réseau.
 */

export type AdvisorSale = { proposed: number; sold: number; notSold: number };

export type AdvisorStats = {
  sales: number;
  /** Ventes terminées avec au moins un conseil vendu. */
  withAdvice: number;
  proposed: number;
  sold: number;
  notSold: number;
  /** withAdvice / sales. */
  attachRate: number | null;
  /** Vendus parmi les conseils proposés. */
  soldRate: number | null;
  /** Vendus parmi les conseils tranchés (Vendu / Non vendu) : le taux d'acceptation par le patient. */
  acceptRate: number | null;
  domains: { label: string; share: number; count: number }[];
  reviews: { count: number; average: number | null };
  level: AdvisorLevel;
  /** Premier jour de vente sur PharmaBoost (AAAA-MM-JJ), ou rien. */
  since: string | null;
};

export type AdvisorLevel = { key: "debut" | "conseiller" | "confirme" | "expert"; label: string; next: string | null };

/** Les familles de produits regroupées en domaines lisibles sur un CV. */
const DOMAIN_OF: Record<string, string> = {
  PROBIOTIQUES: "Microbiote et flore intestinale",
  VITAMINES: "Micronutrition",
  MINERAUX: "Micronutrition",
  MAGNESIUM: "Micronutrition",
  NUTRITION: "Nutrition",
  DERMATOLOGIE: "Dermatologie",
  DERMOCOSMETIQUE: "Dermocosmétique",
  SOINS: "Soins et hygiène",
  HYGIENE: "Soins et hygiène",
  PHYTOTHERAPIE: "Phytothérapie",
  DISPOSITIFS_MEDICAUX: "Dispositifs médicaux",
  SAISONNIER: "Pathologies saisonnières",
};

const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export function advisorLevel(sold: number, acceptRate: number | null): AdvisorLevel {
  const accept = acceptRate ?? 0;
  if (sold >= 200 && accept >= 0.35) return { key: "expert", label: "Conseiller expert", next: null };
  if (sold >= 50 && accept >= 0.25) return { key: "confirme", label: "Conseiller confirmé", next: "Expert : 200 conseils vendus et 35 % d'acceptation" };
  if (sold >= 10) return { key: "conseiller", label: "Conseiller certifié", next: "Confirmé : 50 conseils vendus et 25 % d'acceptation" };
  return { key: "debut", label: "Conseiller en progression", next: "Certifié : 10 conseils vendus" };
}

export function computeAdvisorStats(input: { sales: readonly AdvisorSale[]; soldCategories: readonly string[]; ratings: readonly number[]; firstSaleDay: string | null }): AdvisorStats {
  let proposed = 0;
  let sold = 0;
  let notSold = 0;
  let withAdvice = 0;
  for (const sale of input.sales) {
    proposed += sale.proposed;
    sold += sale.sold;
    notSold += sale.notSold;
    if (sale.sold > 0) withAdvice += 1;
  }
  const counts = new Map<string, number>();
  for (const category of input.soldCategories) {
    const label = DOMAIN_OF[category];
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const counted = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const domains = [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: counted > 0 ? count / counted : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const acceptRate = rate(sold, sold + notSold);
  const ratings = input.ratings.filter((r) => r >= 1 && r <= 5);
  return {
    sales: input.sales.length,
    withAdvice,
    proposed,
    sold,
    notSold,
    attachRate: rate(withAdvice, input.sales.length),
    soldRate: rate(sold, proposed),
    acceptRate,
    domains,
    reviews: { count: ratings.length, average: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null },
    level: advisorLevel(sold, acceptRate),
    since: input.firstSaleDay,
  };
}

/** Un code court, lisible au téléphone et sans caractère ambigu (ni 0/O, ni 1/I) : « PB-7K3Q-9XWD ». */
export function certificateCode(random: Uint8Array): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const chars = [...random.slice(0, 8)].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `PB-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

export const percentLabel = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)} %`);
