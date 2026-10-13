import { missingRequiredFields, suggestMapping, FIELD_LABELS, type ImportField } from "./columns";
import { readRows, type ImportRow } from "./rows";
import { expandCip } from "./classify";

/**
 * Plusieurs fichiers de stock RÉUNIS en un seul, avant l'aperçu.
 *
 * LGPI ne met qu'un prix par édition d'inventaire (« Prix de référence » : PAMP Net, PA Tarif… ou PV TTC). Pour la
 * marge, il faut le prix d'achat ET le prix de vente : la pharmacienne envoie deux éditions, PharmaBoost les réunit par
 * code produit (CIP/EAN, sinon désignation exacte) :
 *   • prix d'achat et prix de vente : du fichier qui les a — le plus récent d'abord quand deux les ont ;
 *   • TVA, remboursement, marque, rayon : de celui qui les a, le plus récent d'abord ;
 *   • désignation : celle du premier fichier envoyé qui en a une ;
 *   • quantité : celle du fichier le plus récent (date d'édition lue dans le PDF quand TOUS en ont une, sinon l'ordre
 *     d'envoi) ; deux quantités différentes pour un même produit sont comptées, jamais cachées.
 * Un produit présent dans un seul fichier garde ce que ce fichier en dit. Rien n'est inventé : un prix absent reste absent.
 *
 * Le résultat est un tableau aux en-têtes canoniques, relu par l'import comme n'importe quel CSV : contrôles, aperçu,
 * envoi retenu et historique restent ceux d'un fichier unique.
 */

/** Au-delà, ce n'est plus « mes deux éditions de prix », c'est une erreur de sélection. */
export const MERGE_MAX_FILES = 3;

export type PriceKind = "PURCHASE" | "SALE" | "BOTH" | "NONE";

export type MergeInput = {
  fileName: string;
  headers: string[];
  records: Record<string, unknown>[];
  /** « 12/09/2026 04h26 », lu dans l'en-tête d'une édition d'inventaire LGPI. */
  editedAt?: string | null;
  /** « PAMP net », « PV TTC »… le critère d'édition LGPI. */
  priceBasis?: string | null;
  incomplete?: boolean;
  incompleteReason?: string;
  warnings?: string[];
};

export type MergedFile = { fileName: string; priceKind: PriceKind; priceLabel: string | null; editedAt: string | null; lines: number };

export type MergeResult =
  | { ok: false; error: string }
  | {
      ok: true;
      headers: string[];
      records: Record<string, unknown>[];
      files: MergedFile[];
      /** Produits distincts après réunion. */
      products: number;
      /** Produits qui ont, après réunion, un prix d'achat ET un prix de vente. */
      withBothPrices: number;
      /** Produits présents dans plusieurs fichiers avec des quantités différentes : la plus récente est retenue. */
      quantityConflicts: number;
      incomplete: boolean;
      incompleteReason?: string;
      warnings: string[];
    };

export const MERGED_HEADERS = ["Code produit", "Désignation", "Qte Stock", "PA HT", "PV TTC", "TVA", "Remboursement", "Marque", "Catégorie"] as const;

/** « 12/09/2026 04h26 » → instant comparable ; illisible → null. */
export function parseEditedAt(value: string | null | undefined): number | null {
  const match = /(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2})[h:](\d{2}))?/.exec(value ?? "");
  if (!match) return null;
  const [, day, month, year, hour = "0", minute = "0"] = match;
  const time = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isFinite(time) ? time : null;
}

export function priceKindOf(rows: Pick<ImportRow, "purchasePriceCents" | "salePriceCents">[]): PriceKind {
  const purchase = rows.some((row) => row.purchasePriceCents != null);
  const sale = rows.some((row) => row.salePriceCents != null);
  return purchase && sale ? "BOTH" : purchase ? "PURCHASE" : sale ? "SALE" : "NONE";
}

/** Un CIP7 (export CSV) et le CIP13 (édition PDF) d'une même présentation sont un seul produit, comme à la classification. */
const codeKey = (code: string) => (/^\d{7}$/.test(code) ? (expandCip(code) ?? code) : code);
const keyOf = (row: ImportRow) => (row.code ? `code:${codeKey(row.code)}` : row.name ? `name:${row.name.toLowerCase()}` : null);

/**
 * Ce que la colonne « Remboursement » doit porter pour être relue à l'identique (`parseReimbursement`) : le code de
 * prestation, le code LPP ou le taux d'origine. Une déduction de la TVA à 2,1 % n'est pas écrite : l'import la refait.
 */
function reimbursementCell(row: ImportRow): string | null {
  if (row.reimbursed == null) return null;
  const source = row.reimbursementSource ?? "";
  const code = /prestation (\w+)/.exec(source) ?? /code LPP (\d{7})/.exec(source);
  if (code) return code[1];
  const rate = /remboursé à (\d+) %/.exec(source);
  if (rate) return `${rate[1]} %`;
  if (/^TVA/.test(source)) return null;
  return row.reimbursed ? "oui" : "non";
}

export function mergeImportFiles(inputs: MergeInput[]): MergeResult {
  if (inputs.length === 0) return { ok: false, error: "Aucun fichier à réunir." };
  if (inputs.length > MERGE_MAX_FILES) return { ok: false, error: `${MERGE_MAX_FILES} fichiers au plus peuvent être réunis en un envoi.` };

  const read = inputs.map((input, index) => {
    const mapping = suggestMapping(input.headers);
    const missing = missingRequiredFields(mapping);
    return { input, index, mapping, missing, rows: missing.length > 0 ? [] : readRows(input.records, mapping), time: parseEditedAt(input.editedAt) };
  });
  const broken = read.find((file) => file.missing.length > 0);
  if (broken) {
    const names = broken.missing.map((field: ImportField) => FIELD_LABELS[field]).join(", ");
    return { ok: false, error: `Le fichier « ${broken.input.fileName} » n'a pas les colonnes attendues (${names}). Envoyez l'édition d'inventaire complète de votre logiciel : rien n'a été modifié.` };
  }

  // Du plus récent au plus ancien : la date d'édition quand tous les fichiers en ont une, sinon le dernier envoyé d'abord.
  const dated = read.every((file) => file.time !== null);
  const byRecency = [...read].sort((a, b) => (dated ? (b.time as number) - (a.time as number) : 0) || b.index - a.index);

  type Merged = { row: ImportRow; quantityFrom: number | null; seen: Set<number>; quantities: Set<number> };
  const merged = new Map<string, Merged>();
  const loose: ImportRow[] = [];
  // Ordre d'envoi pour la désignation (« celle du premier »), ordre de récence pour tout le reste.
  for (const file of read) {
    for (const row of file.rows) {
      const key = keyOf(row);
      if (!key) {
        loose.push(row);
        continue;
      }
      if (!merged.has(key)) merged.set(key, { row: { ...row, quantity: null, salePriceCents: null, purchasePriceCents: null, vatRate: null, reimbursed: null, reimbursementSource: null, brand: null, categoryLabel: null }, quantityFrom: null, seen: new Set(), quantities: new Set() });
      const entry = merged.get(key) as Merged;
      entry.row.name = entry.row.name ?? row.name;
      // Le CIP13 l'emporte sur le CIP7 quand un fichier le donne : le code réuni est le plus précis.
      if (row.code && /^\d{13}$/.test(row.code) && entry.row.code && /^\d{7}$/.test(entry.row.code)) entry.row.code = row.code;
    }
  }
  for (const file of byRecency) {
    for (const row of file.rows) {
      const key = keyOf(row);
      if (!key) continue;
      const entry = merged.get(key) as Merged;
      const target = entry.row;
      entry.seen.add(file.index);
      if (row.quantity !== null && !row.issues.includes("QUANTITE_INVALIDE")) {
        entry.quantities.add(row.quantity);
        if (entry.quantityFrom === null) {
          target.quantity = row.quantity;
          entry.quantityFrom = file.index;
        }
      }
      target.purchasePriceCents = target.purchasePriceCents ?? row.purchasePriceCents;
      target.salePriceCents = target.salePriceCents ?? row.salePriceCents;
      target.vatRate = target.vatRate ?? row.vatRate;
      if (target.reimbursed == null && row.reimbursed != null) {
        target.reimbursed = row.reimbursed;
        target.reimbursementSource = row.reimbursementSource ?? null;
      }
      target.brand = target.brand ?? row.brand;
      target.categoryLabel = target.categoryLabel ?? row.categoryLabel;
    }
  }

  const rows = [...[...merged.values()].map((entry) => entry.row), ...loose];
  const files: MergedFile[] = read.map((file) => {
    const kind = priceKindOf(file.rows);
    const columns = [file.mapping.purchasePrice, file.mapping.salePrice].filter((column): column is string => Boolean(column));
    return {
      fileName: file.input.fileName,
      priceKind: kind,
      priceLabel: kind === "NONE" ? null : file.input.priceBasis?.trim() || columns.join(" / ") || null,
      editedAt: file.input.editedAt ?? null,
      lines: file.rows.length,
    };
  });
  const notRead = read.filter((file) => file.input.incomplete).map((file) => `« ${file.input.fileName} » : ${file.input.incompleteReason ?? "une partie du fichier n'a pas pu être lue"}`);

  return {
    ok: true,
    headers: [...MERGED_HEADERS],
    records: rows.map((row) => ({
      "Code produit": row.code,
      Désignation: row.name,
      "Qte Stock": row.quantity,
      "PA HT": row.purchasePriceCents !== null ? (row.purchasePriceCents / 100).toFixed(2) : null,
      "PV TTC": row.salePriceCents !== null ? (row.salePriceCents / 100).toFixed(2) : null,
      TVA: row.vatRate,
      Remboursement: reimbursementCell(row),
      Marque: row.brand,
      Catégorie: row.categoryLabel,
    })),
    files,
    products: rows.length,
    withBothPrices: rows.filter((row) => row.purchasePriceCents !== null && row.salePriceCents !== null).length,
    quantityConflicts: [...merged.values()].filter((entry) => entry.quantities.size > 1).length,
    incomplete: notRead.length > 0,
    ...(notRead.length > 0 ? { incompleteReason: notRead.join(" ; ") } : {}),
    warnings: inputs.flatMap((input) => (input.warnings ?? []).filter((warning) => !/ce sont des prix d'achat/.test(warning)).map((warning) => `${input.fileName} : ${warning}`)),
  };
}

/** Le tableau réuni, en CSV (point-virgule, UTF-8 avec BOM) : le fichier gardé 90 jours et relu comme un autre. */
export function mergedToCsv(result: Extract<MergeResult, { ok: true }>): string {
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [result.headers.map(cell).join(";"), ...result.records.map((record) => result.headers.map((header) => cell(record[header])).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Le nom du fichier réuni, tel qu'il apparaît dans « Vos derniers envois » : les noms d'origine, borné, toujours « .csv ». */
export function mergedFileName(names: string[]): string {
  const list = names.join(" + ");
  const head = `Réunion de ${names.length} fichiers (`;
  const room = 190 - head.length - ").csv".length;
  return `${head}${list.length > room ? `${list.slice(0, room - 1)}…` : list}).csv`;
}
