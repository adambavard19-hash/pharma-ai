import type { ProductCategoryCode } from "@/core/ai/types";

/**
 * Les univers dans lesquels une officine définit ses gammes privilégiées, ses
 * challenges et ses formations.
 *
 * Une clé texte (pas une énumération en base) : ajouter un univers, c'est
 * ajouter une ligne ici, sans migration. `categories` relie l'univers aux
 * catégories du moteur de conseil : une gamme privilégiée « Douleur » ne
 * départage que des conseils de ces catégories. Un univers sans catégorie
 * (vétérinaire, bébé…) ne s'applique qu'aux produits de la gamme elle-même.
 */
export type Universe = {
  key: string;
  label: string;
  categories: ProductCategoryCode[];
};

export const UNIVERSES: Universe[] = [
  { key: "COMPLEMENTS_ALIMENTAIRES", label: "Compléments alimentaires", categories: ["VITAMINES", "MINERAUX", "MAGNESIUM", "PROBIOTIQUES", "PHYTOTHERAPIE"] },
  { key: "NUTRITION", label: "Nutrition", categories: ["NUTRITION"] },
  { key: "DERMOCOSMETIQUE", label: "Dermocosmétique", categories: ["DERMOCOSMETIQUE", "DERMATOLOGIE", "SOINS"] },
  { key: "VETERINAIRE", label: "Vétérinaire", categories: [] },
  { key: "ORTHOPEDIE", label: "Orthopédie", categories: ["DISPOSITIFS_MEDICAUX"] },
  { key: "BUCCO_DENTAIRE", label: "Bucco-dentaire", categories: [] },
  { key: "BEBE", label: "Bébé", categories: [] },
  { key: "HYGIENE_FEMININE", label: "Hygiène féminine", categories: [] },
  { key: "PRESERVATIFS_LUBRIFIANTS", label: "Préservatifs et lubrifiants", categories: [] },
  { key: "DOULEUR", label: "Douleur", categories: [] },
  { key: "HIVER", label: "Hiver", categories: ["SAISONNIER"] },
];

export const UNIVERSE_KEYS = UNIVERSES.map((u) => u.key);

const BY_KEY = new Map(UNIVERSES.map((u) => [u.key, u]));

export function universeLabel(key: string | null | undefined): string {
  if (!key) return "Tous univers";
  return BY_KEY.get(key)?.label ?? key;
}

export function isUniverseKey(key: string): boolean {
  return BY_KEY.has(key);
}

/**
 * Un univers s'applique-t-il à un conseil de cette catégorie, pour ce produit ?
 * Sans catégorie liée, l'univers ne juge que le produit (déjà reconnu comme
 * appartenant à la gamme) : il s'applique.
 */
export function universeAppliesTo(key: string, opportunityCategory: string | null, productCategory: string | null): boolean {
  const universe = BY_KEY.get(key);
  if (!universe) return false;
  if (universe.categories.length === 0) return true;
  return (
    (!!opportunityCategory && universe.categories.includes(opportunityCategory as ProductCategoryCode)) ||
    (!!productCategory && universe.categories.includes(productCategory as ProductCategoryCode))
  );
}
