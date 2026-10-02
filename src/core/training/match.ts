import { brandKey, productMatchesBrand } from "@/core/catalog/brand";
import { UNIVERSES } from "@/config/universes";
import { cip7ToCip13, isValidEan13 } from "@/core/stock/cip";

/**
 * Quelle formation pour quel produit ?
 *
 * « Se former sur ce produit » ne doit montrer que des contenus qui parlent
 * vraiment de ce produit. Un contenu se rattache, du plus précis au plus
 * large : à un produit de l'officine désigné explicitement, à un code produit
 * (CIP ou EAN — un contenu publié par PharmaBoost ne connaît pas les fiches
 * des officines), à une marque, enfin à un univers.
 *
 * Le ciblage le plus précis renseigné fait foi : un contenu qui vise une
 * marque n'est pas proposé, par son univers, pour la marque voisine. Seul un
 * contenu sans produit, sans code et sans marque se rattache par l'univers.
 *
 * Ce module ne fait que relier des contenus à des produits pour l'équipe. Il
 * n'est lu par aucun moteur de conseil, et n'en lit aucun.
 */

export type TrainingMatchKind = "PRODUCT" | "CODE" | "BRAND" | "UNIVERSE";

/** Plus la valeur est haute, plus le rattachement est précis. */
export const MATCH_RANK: Record<TrainingMatchKind, number> = { PRODUCT: 4, CODE: 3, BRAND: 2, UNIVERSE: 1 };

export const MATCH_LABELS: Record<TrainingMatchKind, string> = {
  PRODUCT: "Ce produit",
  CODE: "Ce produit (code)",
  BRAND: "Sa marque",
  UNIVERSE: "Son univers",
};

/** Le ciblage d'un contenu, tel qu'il est enregistré. */
export type TrainingTargeting = {
  productIds: string[];
  productCodes: string[];
  brandKey: string | null;
  universe: string | null;
};

/** Ce qu'il faut savoir d'un produit de l'officine pour le relier à un contenu. */
export type TrainingProductRef = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  /** EAN, référence, codes appris à la douchette : tout ce qui peut porter un CIP ou un EAN. */
  codes?: (string | null | undefined)[];
};

/**
 * Un code produit comparable : chiffres seuls, CIP7 reconstruit en CIP13,
 * GTIN-14 et UPC-A ramenés à 13 chiffres. Null quand ce n'est pas un code
 * produit valide (une référence interne, une faute de frappe).
 */
export function normalizeProductCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[\s.-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 7) return cip7ToCip13(digits);
  if (digits.length === 8) return digits;
  if (digits.length === 12) digits = `0${digits}`;
  if (digits.length === 14 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 13) return null;
  return isValidEan13(digits) ? digits : null;
}

/** Un contenu vise-t-il quelque chose de plus précis qu'un univers ? */
export function hasSpecificTarget(target: TrainingTargeting): boolean {
  return target.productIds.length > 0 || target.productCodes.length > 0 || !!target.brandKey?.trim();
}

/** L'univers couvre-t-il cette catégorie de produit ? Un univers sans catégorie liée ne couvre rien par lui-même. */
export function universeCoversCategory(universe: string, category: string | null | undefined): boolean {
  if (!category) return false;
  const entry = UNIVERSES.find((u) => u.key === universe);
  return !!entry && (entry.categories as string[]).includes(category);
}

function productCodes(product: TrainingProductRef): Set<string> {
  const codes = new Set<string>();
  for (const raw of product.codes ?? []) {
    const code = normalizeProductCode(raw);
    if (code) codes.add(code);
  }
  return codes;
}

/** Comment ce contenu se rattache-t-il à ce produit ? Null : il ne s'y rattache pas. */
export function matchTrainingToProduct(target: TrainingTargeting, product: TrainingProductRef): TrainingMatchKind | null {
  if (target.productIds.includes(product.id)) return "PRODUCT";
  if (target.productCodes.length > 0) {
    const codes = productCodes(product);
    if (codes.size > 0 && target.productCodes.some((raw) => {
      const code = normalizeProductCode(raw);
      return !!code && codes.has(code);
    })) return "CODE";
  }
  const key = target.brandKey ? brandKey(target.brandKey) : "";
  if (key && productMatchesBrand(product, key)) return "BRAND";
  if (hasSpecificTarget(target)) return null;
  if (target.universe && universeCoversCategory(target.universe, product.category)) return "UNIVERSE";
  return null;
}

export type RankableTraining = TrainingTargeting & {
  id: string;
  title: string;
  /** Contenu publié par l'officine elle-même : il passe devant, à précision égale. */
  isOwn?: boolean;
};

export type RankedTraining<T> = T & { match: TrainingMatchKind };

/** Les contenus qui se rattachent au produit, du plus précis au plus large. */
export function rankTrainingsForProduct<T extends RankableTraining>(contents: T[], product: TrainingProductRef, limit = Infinity): RankedTraining<T>[] {
  const ranked: RankedTraining<T>[] = [];
  for (const content of contents) {
    const match = matchTrainingToProduct(content, product);
    if (match) ranked.push({ ...content, match });
  }
  ranked.sort(
    (a, b) =>
      MATCH_RANK[b.match] - MATCH_RANK[a.match] ||
      Number(!!b.isOwn) - Number(!!a.isOwn) ||
      a.title.localeCompare(b.title, "fr"),
  );
  return ranked.slice(0, limit);
}

/** Pour chaque produit, ses contenus (identifiant et titre), au plus `limit`. Les produits sans contenu sont absents. */
export function trainingsByProduct<T extends RankableTraining>(
  contents: T[],
  products: TrainingProductRef[],
  limit = 3,
): Map<string, { id: string; title: string; match: TrainingMatchKind }[]> {
  const result = new Map<string, { id: string; title: string; match: TrainingMatchKind }[]>();
  for (const product of products) {
    const ranked = rankTrainingsForProduct(contents, product, limit);
    if (ranked.length > 0) result.set(product.id, ranked.map(({ id, title, match }) => ({ id, title, match })));
  }
  return result;
}
