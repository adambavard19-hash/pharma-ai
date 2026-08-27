import type { ProductCategoryCode } from "@/core/ai/types";

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategoryCode, string> = {
  PROBIOTIQUES: "Probiotiques",
  VITAMINES: "Vitamines",
  MINERAUX: "Minéraux",
  MAGNESIUM: "Magnésium",
  HYGIENE: "Hygiène",
  DERMATOLOGIE: "Dermatologie",
  DERMOCOSMETIQUE: "Dermocosmétique",
  SOINS: "Soins",
  NUTRITION: "Nutrition",
  DISPOSITIFS_MEDICAUX: "Dispositifs médicaux",
  PHYTOTHERAPIE: "Phytothérapie",
  SAISONNIER: "Produits saisonniers",
  AUTRE: "Autres produits de conseil",
};

export const PRODUCT_CATEGORIES = Object.keys(
  PRODUCT_CATEGORY_LABELS,
) as ProductCategoryCode[];

/** Taux de TVA usuels en officine. */
export const VAT_RATES = [2.1, 5.5, 10, 20] as const;
