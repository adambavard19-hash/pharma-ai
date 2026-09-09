import type { ColumnMapping } from "./columns";

/**
 * Une ligne du fichier, lue et normalisée — pas encore rattachée à un produit.
 *
 * Tout ce qui est douteux est consigné dans `issues` plutôt que corrigé en
 * silence : une quantité « 12 boîtes » devient 12 avec une note, une quantité
 * « beaucoup » rend la ligne invalide.
 */
export type ImportIssue =
  | "QUANTITE_INVALIDE"
  | "QUANTITE_NEGATIVE"
  | "PRIX_MANQUANT"
  | "PRIX_INVALIDE"
  | "NOM_ET_CODE_MANQUANTS"
  | "CODE_INVALIDE"
  | "DOUBLON";

export const ISSUE_LABELS: Record<ImportIssue, string> = {
  QUANTITE_INVALIDE: "Quantité illisible",
  QUANTITE_NEGATIVE: "Quantité négative, ramenée à 0",
  PRIX_MANQUANT: "Prix manquant",
  PRIX_INVALIDE: "Prix illisible",
  NOM_ET_CODE_MANQUANTS: "Ni nom ni code",
  CODE_INVALIDE: "Code mal formé (ni CIP13 ni EAN13)",
  DOUBLON: "Même produit présent plusieurs fois : quantités additionnées",
};

export type ImportRow = {
  /** Numéro de ligne dans le fichier (1 = première ligne de données). */
  line: number;
  name: string | null;
  /** Code tel que lu, chiffres seulement. */
  code: string | null;
  quantity: number | null;
  salePriceCents: number | null;
  purchasePriceCents: number | null;
  /** Taux de TVA en points (5.5, 10, 20), quand la colonne existe et se lit. */
  vatRate: number | null;
  brand: string | null;
  /** La catégorie ou le rayon tel qu'écrit par le logiciel de l'officine. */
  categoryLabel: string | null;
  issues: ImportIssue[];
};

/** « 5,5 », « 5.5 % », « 20% », 0.2 → 5.5 / 20. Illisible → null, sans anomalie : la TVA est facultative. */
export function parseVatRate(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  let value: number;
  if (typeof raw === "number") value = raw;
  else {
    const text = String(raw).replace(/[%\s]/g, "").replace(",", ".");
    if (text === "") return null;
    value = Number(text);
  }
  if (!Number.isFinite(value) || value < 0) return null;
  // Un taux écrit en fraction (0.2) ou en points (20) : on ramène en points.
  if (value > 0 && value < 1) value = value * 100;
  if (value > 100) return null;
  return Math.round(value * 100) / 100;
}

export function parseQuantity(raw: unknown): { value: number | null; issue: ImportIssue | null } {
  if (raw === null || raw === undefined) return { value: null, issue: "QUANTITE_INVALIDE" };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { value: null, issue: "QUANTITE_INVALIDE" };
    return raw < 0 ? { value: 0, issue: "QUANTITE_NEGATIVE" } : { value: Math.trunc(raw), issue: null };
  }
  const text = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (text === "") return { value: null, issue: "QUANTITE_INVALIDE" };
  const match = /^(-?\d+(?:\.\d+)?)/.exec(text);
  if (!match) return { value: null, issue: "QUANTITE_INVALIDE" };
  const value = Math.trunc(Number(match[1]));
  return value < 0 ? { value: 0, issue: "QUANTITE_NEGATIVE" } : { value, issue: null };
}

/** « 6,90 € », « 6.9 », 6.9 → 690. */
export function parsePriceCents(raw: unknown): { value: number | null; issue: ImportIssue | null } {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { value: null, issue: "PRIX_MANQUANT" };
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0
      ? { value: Math.round(raw * 100), issue: null }
      : { value: null, issue: "PRIX_INVALIDE" };
  }
  const text = String(raw).replace(/[€\s]/g, "").replace(",", ".");
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return { value: null, issue: "PRIX_INVALIDE" };
  return { value: Math.round(value * 100), issue: null };
}

/** Un code n'est que des chiffres ; un CIP7 est complété plus loin, pas ici. */
export function normalizeCode(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function readRows(
  records: Record<string, unknown>[],
  mapping: ColumnMapping,
): ImportRow[] {
  const rows: ImportRow[] = [];

  records.forEach((record, index) => {
    const issues: ImportIssue[] = [];
    const nameRaw = mapping.name ? record[mapping.name] : null;
    const name = nameRaw !== null && nameRaw !== undefined ? String(nameRaw).trim() || null : null;
    const code = mapping.code ? normalizeCode(record[mapping.code]) : null;

    if (!name && !code) issues.push("NOM_ET_CODE_MANQUANTS");
    if (code && code.length !== 13 && code.length !== 7 && code.length !== 8) issues.push("CODE_INVALIDE");

    const quantity = parseQuantity(mapping.quantity ? record[mapping.quantity] : null);
    if (quantity.issue) issues.push(quantity.issue);

    const sale = mapping.salePrice ? parsePriceCents(record[mapping.salePrice]) : { value: null, issue: null };
    if (sale.issue) issues.push(sale.issue);

    const purchase = mapping.purchasePrice
      ? parsePriceCents(record[mapping.purchasePrice])
      : { value: null, issue: null };
    const text = (field: keyof ColumnMapping) => {
      const column = mapping[field];
      const raw = column ? record[column] : null;
      return raw !== null && raw !== undefined ? String(raw).trim() || null : null;
    };

    rows.push({
      line: index + 1,
      name,
      code,
      quantity: quantity.value,
      salePriceCents: sale.value,
      purchasePriceCents: purchase.issue ? null : purchase.value,
      vatRate: mapping.vatRate ? parseVatRate(record[mapping.vatRate]) : null,
      brand: text("brand"),
      categoryLabel: text("category"),
      issues,
    });
  });

  return mergeDuplicates(rows);
}

/**
 * Deux lignes pour le même produit — même code, ou même nom sans code — sont
 * additionnées et signalées. Le titulaire voit le doublon ; il n'importe pas
 * deux fois la même boîte sans le savoir.
 */
export function mergeDuplicates(rows: ImportRow[]): ImportRow[] {
  const byKey = new Map<string, ImportRow>();
  const result: ImportRow[] = [];

  for (const row of rows) {
    const key = row.code ? `code:${row.code}` : row.name ? `name:${row.name.toLowerCase()}` : null;
    if (!key) {
      result.push(row);
      continue;
    }
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity = (existing.quantity ?? 0) + (row.quantity ?? 0);
      if (!existing.issues.includes("DOUBLON")) existing.issues.push("DOUBLON");
      existing.salePriceCents = existing.salePriceCents ?? row.salePriceCents;
      existing.purchasePriceCents = existing.purchasePriceCents ?? row.purchasePriceCents;
      existing.vatRate = existing.vatRate ?? row.vatRate;
      existing.brand = existing.brand ?? row.brand;
      existing.categoryLabel = existing.categoryLabel ?? row.categoryLabel;
      existing.name = existing.name ?? row.name;
      continue;
    }
    byKey.set(key, row);
    result.push(row);
  }
  return result;
}
