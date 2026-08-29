/**
 * Ce que l'officine détient du catalogue national.
 *
 * Une règle commerciale tient dans ce fichier : **une boîte que la pharmacie
 * n'a pas ne peut pas être proposée**. Elle est écrite ici, pure et testée,
 * plutôt que répétée dans chaque écran — une règle recopiée est une règle qui
 * finit par diverger.
 */

import { readScannedCode } from "./cip";

export type DrugStockState =
  /** L'officine en a. C'est le seul état qui autorise une proposition. */
  | "IN_STOCK"
  /** L'officine référence la boîte mais n'en a plus. */
  | "REFERENCED_EMPTY"
  /** L'officine ne la référence pas du tout. */
  | "NOT_REFERENCED";

export const DRUG_STOCK_STATE_LABELS: Record<DrugStockState, string> = {
  IN_STOCK: "En stock",
  REFERENCED_EMPTY: "Référencé, épuisé",
  NOT_REFERENCED: "Hors stock",
};

export function drugStockState(line: { quantity: number } | null | undefined): DrugStockState {
  if (!line) return "NOT_REFERENCED";
  return line.quantity > 0 ? "IN_STOCK" : "REFERENCED_EMPTY";
}

/**
 * Peut-on proposer cette boîte au patient ?
 *
 * Non si l'officine ne l'a pas — quel que soit son intérêt médical, sa marge ou
 * sa place dans un classement. Proposer ce qu'on n'a pas fait perdre du temps
 * au comptoir et de la crédibilité au pharmacien.
 */
export function canRecommendDrug(line: { quantity: number } | null | undefined): boolean {
  return drugStockState(line) === "IN_STOCK";
}

export function isLowDrugStock(line: { quantity: number; alertThreshold: number }): boolean {
  // Un seuil à zéro veut dire « pas d'alerte », pas « alerte permanente ».
  return line.alertThreshold > 0 && line.quantity <= line.alertThreshold;
}

// ---------------------------------------------------------------------------
// Import en masse
// ---------------------------------------------------------------------------

export type BulkStockEntry = {
  lineNumber: number;
  /** Code CIP13, reconstruit si la ligne portait un CIP7. */
  cip13: string;
  /** Quantité déclarée, ou `null` si la ligne n'en portait pas. */
  quantity: number | null;
};

export type BulkStockRejection = {
  lineNumber: number;
  raw: string;
  reason: string;
};

export type BulkStockList = {
  entries: BulkStockEntry[];
  rejected: BulkStockRejection[];
  /** Codes présents plusieurs fois : la dernière occurrence l'emporte. */
  duplicates: number;
  /**
   * Lignes réellement examinées — hors lignes vides et commentaires.
   * Ce n'est PAS `entries + rejected` : un code répété n'occupe qu'une entrée.
   */
  read: number;
  /** Lignes valides ne portant pas de quantité. */
  withoutQuantity: number;
};

/** Nombre maximal de lignes acceptées en une fois. */
export const BULK_STOCK_MAX_LINES = 50_000;

const SEPARATORS = /[;,\t|]/;

/**
 * Lit une liste de codes collée ou téléversée par l'officine.
 *
 * Le format est délibérément permissif sur la forme et strict sur le fond :
 * un pharmacien exporte son logiciel de stock comme il peut, mais un code
 * douteux n'entre jamais dans la base. Chaque ligne refusée est rendue avec son
 * numéro et son motif — c'est ce qui permet de corriger un export de 8 000
 * lignes sans le relire à l'œil.
 *
 * Formes acceptées, une par ligne :
 *   3400949497294
 *   3400949497294;12
 *   3400949497294,12
 *   4949729   (CIP7 : le CIP13 est reconstruit)
 *
 * Les lignes vides et celles commençant par « # » sont ignorées.
 */
export function parseBulkStockList(content: string): BulkStockList {
  const entries = new Map<string, BulkStockEntry>();
  const rejected: BulkStockRejection[] = [];
  let duplicates = 0;
  let withoutQuantity = 0;
  // Le plafond compte les lignes RÉELLEMENT traitées, pas les codes retenus :
  // un export de 200 000 lignes ne portant que dix codes distincts coûte le
  // même travail qu'un export de 200 000 codes différents.
  let considered = 0;

  const lines = content.split(/\r?\n/);

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    considered += 1;
    if (considered > BULK_STOCK_MAX_LINES) {
      rejected.push({
        lineNumber,
        raw: line,
        reason: `Au-delà de ${BULK_STOCK_MAX_LINES.toLocaleString("fr-FR")} lignes, l'import est refusé. Découpez le fichier.`,
      });
      break;
    }

    const [rawCode = "", rawQuantity = ""] = line.split(SEPARATORS, 2).map((part) => part.trim());
    const scanned = readScannedCode(rawCode);

    if (scanned.kind !== "CIP13" && scanned.kind !== "CIP7") {
      rejected.push({ lineNumber, raw: line, reason: rejectionReason(scanned.kind) });
      continue;
    }

    const quantity = parseQuantity(rawQuantity);
    if (quantity === "INVALID") {
      rejected.push({
        lineNumber,
        raw: line,
        reason: `Quantité illisible : « ${rawQuantity} ». Attendu : un nombre entier positif.`,
      });
      continue;
    }

    if (entries.has(scanned.cip13)) duplicates += 1;
    if (quantity === null) withoutQuantity += 1;
    entries.set(scanned.cip13, { lineNumber, cip13: scanned.cip13, quantity });
  }

  return {
    entries: [...entries.values()],
    rejected,
    duplicates,
    read: considered,
    withoutQuantity,
  };
}

function rejectionReason(kind: "EAN13" | "INVALID" | "TEXT"): string {
  switch (kind) {
    case "EAN13":
      return "Code-barres valide mais hors catalogue médicament. Il relève du catalogue de l'officine.";
    case "INVALID":
      return "Code invalide : longueur ou clé de contrôle incorrecte.";
    case "TEXT":
      return "Ce n'est pas un code CIP.";
  }
}

function parseQuantity(raw: string): number | null | "INVALID" {
  if (raw.length === 0) return null;
  if (!/^\d+$/.test(raw)) return "INVALID";
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : "INVALID";
}
