/**
 * Lecture tabulaire des fichiers BDPM.
 *
 * Les fichiers sont séparés par tabulations et n'ont pas d'en-tête. La seule
 * protection possible contre un changement de format en amont est donc de
 * compter les colonnes et de refuser le fichier entier si le compte a changé.
 * C'est délibérément brutal : mieux vaut un import qui s'arrête en disant
 * pourquoi qu'un catalogue de médicaments silencieusement décalé.
 */

import type { BdpmFileSpec } from "./spec";
import {
  cell,
  parseCompactDate,
  parseFrenchDate,
  parseInteger,
  parsePercent,
  parsePriceCents,
  parseYesNo,
  splitList,
} from "./normalize";

export class BdpmFormatError extends Error {
  constructor(
    readonly fileName: string,
    readonly lineNumber: number,
    message: string,
  ) {
    super(`${fileName}, ligne ${lineNumber} : ${message}`);
    this.name = "BdpmFormatError";
  }
}

/**
 * Découpe le contenu en lignes de colonnes, en vérifiant le format.
 *
 * Les fins de ligne ne sont pas homogènes dans la source : CIS_CIP_bdpm.txt
 * utilise LF seul quand les cinq autres fichiers utilisent CRLF. On retire
 * donc le retour chariot ligne par ligne, sans supposer lequel des deux.
 */
export function parseTable(content: string, spec: BdpmFileSpec): string[][] {
  const rows: string[][] = [];
  const lines = content.split("\n");

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0) continue;

    const columns = line.split("\t");
    const lineNumber = index + 1;

    if (columns.length === spec.columns + 1 && spec.allowsTrailingEmptyColumn) {
      // La colonne surnuméraire ne peut être qu'une fin de ligne tabulée.
      if (columns[spec.columns].trim().length > 0) {
        throw new BdpmFormatError(
          spec.fileName,
          lineNumber,
          `colonne surnuméraire non vide (${spec.columns + 1} colonnes attendues vides en fin de ligne)`,
        );
      }
      columns.pop();
    }

    if (columns.length !== spec.columns) {
      throw new BdpmFormatError(
        spec.fileName,
        lineNumber,
        `${columns.length} colonnes au lieu de ${spec.columns}. ` +
          `Le format de la source a changé : l'import s'arrête plutôt que de ranger les valeurs de travers.`,
      );
    }

    rows.push(columns);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Lignes typées. Chaque constructeur renvoie `null` quand la clé naturelle
// manque : une ligne sans code CIS n'est rattachable à rien.
// ---------------------------------------------------------------------------

export type SpecialtyRow = {
  cisCode: string;
  name: string;
  pharmaceuticalForm: string | null;
  administrationRoutes: string[];
  authorizationStatus: string | null;
  authorizationProcedure: string | null;
  marketingStatus: string | null;
  authorizedAt: Date | null;
  bdmStatus: string | null;
  europeanAuthorizationNumber: string | null;
  holders: string[];
  enhancedMonitoring: boolean;
};

export function toSpecialtyRow(columns: string[]): SpecialtyRow | null {
  const cisCode = cell(columns[0]);
  const name = cell(columns[1]);
  if (!cisCode || !name) return null;

  return {
    cisCode,
    name,
    pharmaceuticalForm: cell(columns[2]),
    administrationRoutes: splitList(columns[3]),
    authorizationStatus: cell(columns[4]),
    authorizationProcedure: cell(columns[5]),
    marketingStatus: cell(columns[6]),
    authorizedAt: parseFrenchDate(columns[7]),
    bdmStatus: cell(columns[8]),
    europeanAuthorizationNumber: cell(columns[9]),
    holders: splitList(columns[10]),
    // Absent ou illisible vaut « non surveillé » : c'est l'état par défaut du
    // médicament, pas une information inventée.
    enhancedMonitoring: parseYesNo(columns[11]) ?? false,
  };
}

export type PresentationRow = {
  cisCode: string;
  cip7: string;
  cip13: string;
  label: string;
  administrativeStatus: string | null;
  marketingStatus: string | null;
  marketingDeclaredAt: Date | null;
  approvedForCommunities: boolean | null;
  reimbursementRateRaw: string | null;
  reimbursementRate: number | null;
  priceCents: number | null;
  totalPriceCents: number | null;
  dispensingFeeCents: number | null;
  reimbursementNotice: string | null;
};

export function toPresentationRow(columns: string[]): PresentationRow | null {
  const cisCode = cell(columns[0]);
  const cip7 = cell(columns[1]);
  const cip13 = cell(columns[6]);
  const label = cell(columns[2]);
  if (!cisCode || !cip7 || !cip13 || !label) return null;

  return {
    cisCode,
    cip7,
    cip13,
    label,
    administrativeStatus: cell(columns[3]),
    marketingStatus: cell(columns[4]),
    marketingDeclaredAt: parseFrenchDate(columns[5]),
    approvedForCommunities: parseYesNo(columns[7]),
    reimbursementRateRaw: cell(columns[8]),
    reimbursementRate: parsePercent(columns[8]),
    priceCents: parsePriceCents(columns[9]),
    totalPriceCents: parsePriceCents(columns[10]),
    dispensingFeeCents: parsePriceCents(columns[11]),
    reimbursementNotice: cell(columns[12]),
  };
}

export type CompositionRow = {
  cisCode: string;
  element: string;
  substanceCode: string;
  substanceLabel: string;
  dosage: string | null;
  dosageReference: string | null;
  nature: string;
  linkNumber: string | null;
};

/** Natures rencontrées : `SA` substance active, `FT` fraction thérapeutique. */
export const COMPOSITION_NATURES = ["SA", "FT"] as const;

export function toCompositionRow(columns: string[]): CompositionRow | null {
  const cisCode = cell(columns[0]);
  const element = cell(columns[1]);
  const substanceCode = cell(columns[2]);
  const substanceLabel = cell(columns[3]);
  const nature = cell(columns[6]);
  if (!cisCode || !element || !substanceCode || !substanceLabel || !nature) return null;
  // Une nature inconnue changerait le sens de la ligne pour le moteur de
  // conseil (le sel n'est pas la molécule active) : on ne la devine pas.
  if (!(COMPOSITION_NATURES as readonly string[]).includes(nature)) return null;

  return {
    cisCode,
    element,
    substanceCode,
    substanceLabel,
    dosage: cell(columns[4]),
    dosageReference: cell(columns[5]),
    nature,
    linkNumber: cell(columns[7]),
  };
}

export type PrescriptionConditionRow = { cisCode: string; label: string };

export function toPrescriptionConditionRow(columns: string[]): PrescriptionConditionRow | null {
  const cisCode = cell(columns[0]);
  const label = cell(columns[1]);
  if (!cisCode || !label) return null;
  return { cisCode, label };
}

export type GenericMemberRow = {
  groupExternalId: string;
  groupLabel: string;
  cisCode: string;
  type: number;
  sortOrder: number | null;
};

/** 0 princeps, 1 générique, 2 par complémentarité posologique, 4 substituable. */
export const GENERIC_TYPES = [0, 1, 2, 4] as const;

export function toGenericMemberRow(columns: string[]): GenericMemberRow | null {
  const groupExternalId = cell(columns[0]);
  const groupLabel = cell(columns[1]);
  const cisCode = cell(columns[2]);
  const type = parseInteger(columns[3]);
  if (!groupExternalId || !groupLabel || !cisCode || type === null) return null;
  if (!(GENERIC_TYPES as readonly number[]).includes(type)) return null;

  return { groupExternalId, groupLabel, cisCode, type, sortOrder: parseInteger(columns[4]) };
}

export type SmrOpinionRow = {
  cisCode: string;
  hasDossierCode: string | null;
  evaluationType: string | null;
  opinionDate: Date | null;
  value: string | null;
  label: string | null;
};

export function toSmrOpinionRow(columns: string[]): SmrOpinionRow | null {
  const cisCode = cell(columns[0]);
  if (!cisCode) return null;

  return {
    cisCode,
    hasDossierCode: cell(columns[1]),
    evaluationType: cell(columns[2]),
    // Seul fichier daté en AAAAMMJJ ; les cinq autres sont en JJ/MM/AAAA.
    opinionDate: parseCompactDate(columns[3]),
    value: cell(columns[4]),
    label: cell(columns[5]),
  };
}
