/** Un nom de produit normalisé pour les motifs de règles : minuscules, sans accents, espaces simples. */
export function normalizeProductName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesAny(patterns: string[] | undefined, name: string): boolean {
  if (!patterns || patterns.length === 0) return false;
  const text = normalizeProductName(name);
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(text);
    } catch {
      return false;
    }
  });
}

/** Vrai si le nom contient la marque (mot entier ou préfixe), sans tenir compte de la casse ni des accents. */
export function nameCarriesBrand(name: string, brand: string | null | undefined, productBrand?: string | null): boolean {
  const target = normalizeProductName(brand ?? "");
  if (!target) return false;
  if (productBrand && normalizeProductName(productBrand) === target) return true;
  const text = normalizeProductName(name);
  return new RegExp(`(^|[^a-z0-9])${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
}
