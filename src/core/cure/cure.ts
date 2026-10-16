/**
 * Les rappels de fin de cure (17 oct. 2026) — module pur, sans base.
 *
 * Un complément pris en cure (magnésium, probiotiques, plantes, vitamines, minéraux, nutrition) vendu au comptoir à un patient qui
 * a accepté le bilan par e-mail : sept jours avant la fin de la cure, PharmaBoost lui rappelle de revenir la renouveler.
 *
 * La durée, dans cet ordre (fondateur : « il faut les deux options ») :
 *  1. celle réglée POUR CE PRODUIT dans la console (par son code-barres) ;
 *  2. celle LUE SUR LA BOÎTE : « 30 gélules », « 60 comprimés », « 28 sachets »… à une prise par jour ;
 *  3. celle de sa FAMILLE, réglée dans la console.
 * Sans durée, ou pour une cure de moins de deux semaines, pas de rappel : rien n'est deviné.
 */

export const CURE_CATEGORIES = ["MAGNESIUM", "PROBIOTIQUES", "PHYTOTHERAPIE", "VITAMINES", "MINERAUX", "NUTRITION"] as const;
export type CureCategory = (typeof CURE_CATEGORIES)[number];

export const CURE_CATEGORY_LABELS: Record<CureCategory, string> = {
  MAGNESIUM: "Magnésium",
  PROBIOTIQUES: "Probiotiques",
  PHYTOTHERAPIE: "Plantes (phytothérapie)",
  VITAMINES: "Vitamines",
  MINERAUX: "Minéraux",
  NUTRITION: "Nutrition (compléments)",
};

/** Le rappel part ce nombre de jours avant la fin de la cure. */
export const REMIND_DAYS_BEFORE_END = 7;
/** En dessous, une cure est trop courte pour un rappel. Au-dessus, la durée est jugée douteuse et ignorée. */
export const MIN_CURE_DAYS = 14;
export const MAX_CURE_DAYS = 180;

export const isCureCategory = (category: string | null | undefined): category is CureCategory => (CURE_CATEGORIES as readonly string[]).includes(category ?? "");

export const categoryKey = (category: CureCategory) => `CATEGORY:${category}`;
export const productKey = (ean: string) => `EAN:${ean.replace(/\D/g, "")}`;

/**
 * Le nombre de prises lu dans le nom du produit : « MAG 2 24 comprimés », « ULTRA-LEVURE 200 mg 30 gélules », « B/28 sachets ».
 * Seulement les formes qu'on avale une fois par jour ; un nombre suivi de « mg », « ml » ou « g » n'est jamais lu.
 */
const UNITS = /(?:^|[\s(/x×])(\d{1,3})\s*(?:gélules?|gelules?|gél\.?|gel\b|comprimés?|comprimes?|cpr?s?\.?|capsules?|caps\.?|sachets?|sach\.?|sticks?|ampoules?|amp\.?|unidoses?|doses?|gummies|gommes?|pastilles?\s+à\s+croquer)\b/i;

export function unitsOnBox(name: string): number | null {
  const match = UNITS.exec(name.normalize("NFC"));
  if (!match) return null;
  const units = Number(match[1]);
  return Number.isFinite(units) && units > 0 ? units : null;
}

export type CureDurationRow = { key: string; days: number };
export type CureDuration = { days: number; source: "PRODUCT" | "BOX" | "FAMILY" };

/** La durée de la cure d'un produit, ou rien. */
export function cureDuration(product: { category: string; ean: string | null; name: string }, rows: readonly CureDurationRow[]): CureDuration | null {
  if (!isCureCategory(product.category)) return null;
  const byKey = new Map(rows.map((row) => [row.key, row.days]));
  const valid = (days: number | null | undefined) => (days && days >= MIN_CURE_DAYS && days <= MAX_CURE_DAYS ? days : null);
  const own = product.ean ? byKey.get(productKey(product.ean)) : undefined;
  // Une durée réglée pour ce produit qui vaut 0 : « pas de rappel pour lui », même si sa boîte ou sa famille en donnent un.
  if (own === 0) return null;
  if (valid(own)) return { days: own!, source: "PRODUCT" };
  const box = valid(unitsOnBox(product.name));
  if (box) return { days: box, source: "BOX" };
  const family = valid(byKey.get(categoryKey(product.category)));
  return family ? { days: family, source: "FAMILY" } : null;
}

/** Le jour du rappel : sept jours avant la fin de la cure (à 9 h, heure de Paris, le jour venu — l'envoi part au passage du matin). */
export function reminderDate(soldAt: Date, days: number): Date {
  return new Date(soldAt.getTime() + (days - REMIND_DAYS_BEFORE_END) * 86_400_000);
}

/** « vers le 12 novembre » : la date du rappel, dite au patient dans son bilan. */
export function reminderDay(date: Date, timeZone = "Europe/Paris"): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, day: "numeric", month: "long" }).format(date);
}
