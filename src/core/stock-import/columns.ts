/**
 * Reconnaissance des colonnes d'un fichier de stock.
 *
 * Chaque logiciel d'officine exporte à sa façon : « Désignation », « Libellé »,
 * « Produit » pour le nom ; « CIP », « Code », « EAN », « Code-barres » pour
 * l'identifiant. On propose une correspondance à partir des en-têtes, le
 * titulaire la corrige à l'écran, et c'est cette correspondance validée qui
 * sert à l'analyse — jamais la seule devinette.
 */

export type ImportField = "name" | "code" | "quantity" | "salePrice" | "purchasePrice";

export type ColumnMapping = Partial<Record<ImportField, string>>;

export const FIELD_LABELS: Record<ImportField, string> = {
  name: "Nom du produit",
  code: "CIP / EAN",
  quantity: "Quantité",
  salePrice: "Prix TTC",
  purchasePrice: "Prix d'achat",
};

/** Ce qui est indispensable pour importer une ligne. */
export const REQUIRED_FIELDS: ImportField[] = ["quantity"];

const HINTS: Record<ImportField, RegExp[]> = {
  code: [/\bcip\b/i, /cip\s*13/i, /\bean\b/i, /code[\s_-]*barre/i, /^code$/i, /\bgtin\b/i, /^acl/i],
  name: [/^nom/i, /d[ée]signation/i, /libell[ée]/i, /^produit/i, /^article/i, /^description/i, /^name$/i],
  quantity: [/^qt[ée]/i, /quantit/i, /^stock/i, /^qty/i, /^quantity/i],
  salePrice: [/prix.*ttc/i, /prix.*vente/i, /^pv/i, /^ttc/i, /^prix$/i, /^price/i, /vente/i],
  purchasePrice: [/prix.*achat/i, /^pa\b/i, /^ht$/i, /achat/i, /^cost/i, /pamp/i],
};

export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Propose une correspondance depuis les en-têtes.
 *
 * Chaque champ prend la première colonne qui lui ressemble et qu'aucun autre
 * champ n'a déjà prise. Le prix d'achat est cherché avant le prix de vente :
 * « Prix d'achat » ressemble aussi à « prix », et il ne doit pas devenir le
 * prix TTC.
 */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<string>();
  const order: ImportField[] = ["code", "quantity", "purchasePrice", "salePrice", "name"];

  for (const field of order) {
    const match = headers.find(
      (header) =>
        !taken.has(header) &&
        HINTS[field].some((pattern) => pattern.test(normalizeHeader(header)) || pattern.test(header)),
    );
    if (match) {
      mapping[field] = match;
      taken.add(match);
    }
  }
  return mapping;
}

export function missingRequiredFields(mapping: ColumnMapping): ImportField[] {
  const missing = REQUIRED_FIELDS.filter((field) => !mapping[field]);
  // Sans nom ni code, aucune ligne ne peut être rattachée à quoi que ce soit.
  if (!mapping.name && !mapping.code) missing.push("name");
  return missing;
}
