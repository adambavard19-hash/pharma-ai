import { normalizeSearchText } from "../reference/search";
import type { InteractionSeverity, InteractionSideKind } from "./types";

/**
 * Lecture du référentiel d'interactions fourni par l'officine.
 *
 * Contrairement aux fichiers BDPM, dont le format nous est imposé, celui-ci est
 * défini ici. On en profite pour exiger une ligne d'en-tête aux noms exacts :
 * un fichier dont les colonnes ont été interverties est alors refusé, ce qu'un
 * format purement positionnel ne saurait pas détecter. Sur des données de
 * sécurité, une colonne décalée est pire qu'un import qui échoue.
 *
 * Toute anomalie arrête le fichier entier en citant la ligne. Rien n'est
 * deviné, rien n'est complété, aucune ligne douteuse n'est « passée ».
 */

export class InteractionFormatError extends Error {
  constructor(
    readonly fileName: string,
    readonly lineNumber: number,
    message: string,
    readonly excerpt?: string,
  ) {
    super(
      `${fileName}, ligne ${lineNumber} : ${message}` +
        (excerpt ? `\n  Contenu lu : « ${excerpt.replaceAll("\t", "⇥").slice(0, 200)} »` : ""),
    );
    this.name = "InteractionFormatError";
  }
}

export const INTERACTIONS_FILE = "interactions.tsv";
export const CLASSES_FILE = "classes.tsv";
export const META_FILE = "meta.json";
export const ALIASES_FILE = "alias.tsv";

export const INTERACTION_COLUMNS = [
  "type_gauche",
  "libelle_gauche",
  "type_droit",
  "libelle_droit",
  "niveau",
  "risque",
  "conduite_a_tenir",
] as const;

export const CLASS_COLUMNS = ["classe", "substance"] as const;

/**
 * Correspondances de vocabulaire entre le référentiel et le catalogue national.
 *
 * Le catalogue national écrit « AMOXICILLINE TRIHYDRATÉE » ou
 * « AMOXICILLINE BASE » ; un thésaurus écrit « amoxicilline ». Sans
 * correspondance déclarée, l'appariement strict raterait l'interaction — un
 * faux négatif dans une fonction de sécurité, c'est-à-dire le pire des échecs
 * possibles ici.
 *
 * Ces correspondances sont FOURNIES, jamais devinées. Pharma.ai ne décide pas
 * que deux libellés désignent la même substance : il ne fait qu'appliquer ce
 * que l'officine a déclaré.
 */
export const ALIAS_COLUMNS = ["libelle_referentiel", "libelle_catalogue"] as const;

/** Les quatre niveaux, acceptés avec ou sans accents, avec ou sans tirets. */
const SEVERITY_BY_LABEL: Record<string, InteractionSeverity> = {
  "CONTRE INDICATION": "CONTRAINDICATION",
  "CONTRE-INDICATION": "CONTRAINDICATION",
  "ASSOCIATION DECONSEILLEE": "NOT_RECOMMENDED",
  "PRECAUTION D'EMPLOI": "PRECAUTION",
  "PRECAUTION D EMPLOI": "PRECAUTION",
  "A PRENDRE EN COMPTE": "TO_CONSIDER",
};

const KIND_BY_LABEL: Record<string, InteractionSideKind> = {
  SUBSTANCE: "SUBSTANCE",
  CLASSE: "CLASS",
  CLASS: "CLASS",
};

export type ParsedInteractionRow = {
  leftLabel: string;
  rightLabel: string;
  leftKey: string;
  rightKey: string;
  leftKind: InteractionSideKind;
  rightKind: InteractionSideKind;
  severity: InteractionSeverity;
  risk: string;
  guidance: string | null;
};

export type ParsedClassRow = {
  classLabel: string;
  classKey: string;
  substanceLabel: string;
  substanceKey: string;
};

export type InteractionMeta = {
  name: string;
  version: string;
  /** Date de mise à jour annoncée par la source. */
  updatedAt: Date | null;
  url: string | null;
};

/** Découpe en lignes utiles, quels que soient les retours à la ligne. */
function usefulLines(content: string): { text: string; number: number }[] {
  return content
    .replace(/^﻿/, "")
    .split(/\r\n|\n|\r/)
    .map((text, index) => ({ text, number: index + 1 }))
    .filter((line) => line.text.trim().length > 0);
}

function checkHeader(
  fileName: string,
  header: { text: string; number: number },
  expected: readonly string[],
): void {
  const columns = header.text.split("\t").map((c) => c.trim().toLowerCase());
  const same =
    columns.length === expected.length && columns.every((c, i) => c === expected[i]);
  if (!same) {
    throw new InteractionFormatError(
      fileName,
      header.number,
      `en-tête inattendu. Colonnes attendues, dans cet ordre : ${expected.join(", ")}.`,
      header.text,
    );
  }
}

export function parseInteractionsFile(
  content: string,
  fileName = INTERACTIONS_FILE,
): ParsedInteractionRow[] {
  const lines = usefulLines(content);
  if (lines.length === 0) {
    throw new InteractionFormatError(fileName, 1, "fichier vide.");
  }
  checkHeader(fileName, lines[0], INTERACTION_COLUMNS);

  const rows: ParsedInteractionRow[] = [];
  const seen = new Set<string>();

  for (const line of lines.slice(1)) {
    const cells = line.text.split("\t");
    if (cells.length !== INTERACTION_COLUMNS.length) {
      throw new InteractionFormatError(
        fileName,
        line.number,
        `${cells.length} colonne(s) au lieu de ${INTERACTION_COLUMNS.length}.`,
        line.text,
      );
    }

    const [rawLeftKind, rawLeft, rawRightKind, rawRight, rawSeverity, rawRisk, rawGuidance] =
      cells.map((c) => c.trim());

    const leftKind = KIND_BY_LABEL[normalizeSearchText(rawLeftKind)];
    const rightKind = KIND_BY_LABEL[normalizeSearchText(rawRightKind)];
    if (!leftKind || !rightKind) {
      throw new InteractionFormatError(
        fileName,
        line.number,
        `type inconnu. Valeurs acceptées : substance, classe.`,
        line.text,
      );
    }

    const severity = SEVERITY_BY_LABEL[normalizeSearchText(rawSeverity)];
    if (!severity) {
      throw new InteractionFormatError(
        fileName,
        line.number,
        `niveau inconnu : « ${rawSeverity} ». Valeurs acceptées : contre-indication, association déconseillée, précaution d'emploi, à prendre en compte.`,
        line.text,
      );
    }

    if (!rawLeft || !rawRight) {
      throw new InteractionFormatError(
        fileName,
        line.number,
        "libellé manquant : un couple sans ses deux côtés n'est pas exploitable.",
        line.text,
      );
    }

    // Le risque est ce que le pharmacien lira. Une règle sans risque décrit
    // serait une alerte sans contenu : on refuse plutôt que d'en inventer un.
    if (!rawRisk) {
      throw new InteractionFormatError(
        fileName,
        line.number,
        "risque manquant. Pharma.ai n'affiche pas d'alerte dont il ne peut pas dire la raison.",
        line.text,
      );
    }

    const leftKey = normalizeSearchText(rawLeft);
    const rightKey = normalizeSearchText(rawRight);
    if (leftKey === rightKey) {
      throw new InteractionFormatError(
        fileName,
        line.number,
        "les deux côtés du couple sont identiques.",
        line.text,
      );
    }

    // Un doublon strict est probablement une erreur de fabrication du fichier :
    // on le signale au lieu de le laisser produire deux fois la même alerte.
    const dedupe = `${[leftKey, rightKey].sort().join("|")}|${severity}`;
    if (seen.has(dedupe)) {
      throw new InteractionFormatError(
        fileName,
        line.number,
        "couple déjà déclaré avec le même niveau plus haut dans le fichier.",
        line.text,
      );
    }
    seen.add(dedupe);

    rows.push({
      leftLabel: rawLeft,
      rightLabel: rawRight,
      leftKey,
      rightKey,
      leftKind,
      rightKind,
      severity,
      risk: rawRisk,
      guidance: rawGuidance || null,
    });
  }

  return rows;
}

export function parseClassesFile(
  content: string,
  fileName = CLASSES_FILE,
): ParsedClassRow[] {
  const lines = usefulLines(content);
  if (lines.length === 0) {
    throw new InteractionFormatError(fileName, 1, "fichier vide.");
  }
  checkHeader(fileName, lines[0], CLASS_COLUMNS);

  const rows: ParsedClassRow[] = [];
  const seen = new Set<string>();

  for (const line of lines.slice(1)) {
    const cells = line.text.split("\t");
    if (cells.length !== CLASS_COLUMNS.length) {
      throw new InteractionFormatError(
        fileName,
        line.number,
        `${cells.length} colonne(s) au lieu de ${CLASS_COLUMNS.length}.`,
        line.text,
      );
    }

    const [classLabel, substanceLabel] = cells.map((c) => c.trim());
    if (!classLabel || !substanceLabel) {
      throw new InteractionFormatError(
        fileName,
        line.number,
        "classe ou substance manquante.",
        line.text,
      );
    }

    const classKey = normalizeSearchText(classLabel);
    const substanceKey = normalizeSearchText(substanceLabel);
    const dedupe = `${classKey}|${substanceKey}`;
    if (seen.has(dedupe)) continue; // Un doublon d'appartenance est inoffensif.
    seen.add(dedupe);

    rows.push({ classLabel, classKey, substanceLabel, substanceKey });
  }

  return rows;
}

export type ParsedAliasRow = {
  referentialLabel: string;
  referentialKey: string;
  catalogLabel: string;
  catalogKey: string;
};

export function parseAliasesFile(
  content: string,
  fileName = ALIASES_FILE,
): ParsedAliasRow[] {
  const lines = usefulLines(content);
  if (lines.length === 0) {
    throw new InteractionFormatError(fileName, 1, "fichier vide.");
  }
  checkHeader(fileName, lines[0], ALIAS_COLUMNS);

  const rows: ParsedAliasRow[] = [];
  const seen = new Set<string>();

  for (const line of lines.slice(1)) {
    const cells = line.text.split("\t");
    if (cells.length !== ALIAS_COLUMNS.length) {
      throw new InteractionFormatError(
        fileName,
        line.number,
        `${cells.length} colonne(s) au lieu de ${ALIAS_COLUMNS.length}.`,
        line.text,
      );
    }

    const [referentialLabel, catalogLabel] = cells.map((c) => c.trim());
    if (!referentialLabel || !catalogLabel) {
      throw new InteractionFormatError(
        fileName,
        line.number,
        "les deux libellés sont nécessaires pour établir une correspondance.",
        line.text,
      );
    }

    const referentialKey = normalizeSearchText(referentialLabel);
    const catalogKey = normalizeSearchText(catalogLabel);
    const dedupe = `${referentialKey}|${catalogKey}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    rows.push({ referentialLabel, referentialKey, catalogLabel, catalogKey });
  }

  return rows;
}

/**
 * Le fichier d'identité du référentiel.
 *
 * Il est OBLIGATOIRE. Sans nom, version et date, on ne peut pas afficher d'où
 * vient une alerte ni de quand elle date — et une alerte de sécurité sans
 * provenance n'a pas sa place au comptoir.
 */
export function parseMetaFile(content: string, fileName = META_FILE): InteractionMeta {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new InteractionFormatError(fileName, 1, "JSON illisible.");
  }

  const value = raw as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const version = typeof value.version === "string" ? value.version.trim() : "";
  if (!name || !version) {
    throw new InteractionFormatError(
      fileName,
      1,
      "« name » et « version » sont obligatoires : sans eux, aucune alerte ne peut citer sa source.",
    );
  }

  let updatedAt: Date | null = null;
  if (typeof value.updatedAt === "string" && value.updatedAt.trim()) {
    const parsed = new Date(value.updatedAt.trim());
    if (Number.isNaN(parsed.getTime())) {
      throw new InteractionFormatError(
        fileName,
        1,
        `« updatedAt » n'est pas une date lisible : « ${value.updatedAt} ». Format attendu : AAAA-MM-JJ.`,
      );
    }
    updatedAt = parsed;
  } else {
    throw new InteractionFormatError(
      fileName,
      1,
      "« updatedAt » est obligatoire : la date de mise à jour de la source doit être affichable.",
    );
  }

  return {
    name,
    version,
    updatedAt,
    url: typeof value.url === "string" && value.url.trim() ? value.url.trim() : null,
  };
}
