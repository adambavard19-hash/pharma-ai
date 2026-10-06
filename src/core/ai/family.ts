/**
 * Les trois familles de conseil au comptoir.
 *
 * Un conseil complet ne se limite pas à un seul genre de produit : le
 * pharmacien peut avoir à proposer un médicament conseil (il se délivre en
 * pharmacie, sans ordonnance), un complément alimentaire, ou un produit de
 * parapharmacie (hygiène, dermocosmétique, soin, dispositif). La famille se
 * déduit du produit — jamais d'une saisie — et ne change aucun score : elle sert
 * à équilibrer ce qui est montré et à le lire d'un coup d'œil.
 */
export type AdviceFamily = "MEDICAMENT" | "COMPLEMENT" | "PARAPHARMACIE";

export const ADVICE_FAMILIES: readonly AdviceFamily[] = ["MEDICAMENT", "COMPLEMENT", "PARAPHARMACIE"];

export const FAMILY_LABELS: Record<AdviceFamily, string> = {
  MEDICAMENT: "Médicament conseil",
  COMPLEMENT: "Complément alimentaire",
  PARAPHARMACIE: "Parapharmacie",
};

/** Au singulier, pour les résumés (« 1 produit de parapharmacie »). */
export const FAMILY_SINGULAR_LABELS: Record<AdviceFamily, string> = {
  MEDICAMENT: "médicament conseil",
  COMPLEMENT: "complément alimentaire",
  PARAPHARMACIE: "produit de parapharmacie",
};

/** Au pluriel, pour les résumés (« 2 compléments alimentaires »). */
export const FAMILY_PLURAL_LABELS: Record<AdviceFamily, string> = {
  MEDICAMENT: "médicaments conseil",
  COMPLEMENT: "compléments alimentaires",
  PARAPHARMACIE: "produits de parapharmacie",
};

/** Les catégories de produits qui relèvent des compléments alimentaires et de la phytothérapie. */
const COMPLEMENT_CATEGORIES: ReadonlySet<string> = new Set(["PROBIOTIQUES", "VITAMINES", "MINERAUX", "MAGNESIUM", "PHYTOTHERAPIE", "NUTRITION"]);

/**
 * La famille d'un produit. Une présentation du catalogue national (un
 * médicament en stock) est TOUJOURS un médicament conseil, quelle que soit la
 * catégorie que le dictionnaire d'usage lui donne (un probiotique vendu comme
 * médicament reste un médicament). Sinon, la catégorie du produit décide.
 */
export function adviceFamilyOf(product: { presentationId?: string | null; origin?: string | null; category: string }): AdviceFamily {
  if (product.presentationId || product.origin === "NATIONAL_DRUG") return "MEDICAMENT";
  return COMPLEMENT_CATEGORIES.has(product.category) ? "COMPLEMENT" : "PARAPHARMACIE";
}

export type FamilyCounts = Record<AdviceFamily, number>;

export function countByFamily(families: readonly AdviceFamily[]): FamilyCounts {
  const counts: FamilyCounts = { MEDICAMENT: 0, COMPLEMENT: 0, PARAPHARMACIE: 0 };
  for (const family of families) counts[family] += 1;
  return counts;
}

/**
 * « 1 médicament conseil · 2 compléments alimentaires · 3 produits de parapharmacie »
 * (les familles absentes ne sont pas écrites). Le singulier a son propre libellé :
 * « 1 produit de parapharmacie », jamais « 1 parapharmacie ».
 */
export function describeFamilyMix(counts: FamilyCounts): string {
  const label = (family: AdviceFamily, n: number) => (n === 1 ? FAMILY_SINGULAR_LABELS[family] : FAMILY_PLURAL_LABELS[family]);
  return ADVICE_FAMILIES.filter((family) => counts[family] > 0)
    .map((family) => `${counts[family]} ${label(family, counts[family])}`)
    .join(" · ");
}
