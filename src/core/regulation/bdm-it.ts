/**
 * La base tarifaire de l'Assurance Maladie, lue boîte par boîte.
 *
 * La Base des Médicaments et Informations Tarifaires (BdM_IT) est la base de
 * référence des médicaments remboursables. Sa fiche par code CIP porte deux
 * informations que la Base de données publique des médicaments ne contient
 * pas, et qui décident d'un rejet de facturation :
 *
 *   - « Statut d'Exception : Oui » — le médicament ne se prend en charge que
 *     sur une ordonnance de médicaments d'exception (formulaire à 4 volets) ;
 *   - l'historique d'homologation aux assurés sociaux — les dates de début et
 *     de fin de prise en charge, avec le motif.
 *
 * La fiche est une page HTML des années 2000, servie en UTF-8, sans identifiant
 * ni classe utile : on la lit par ses libellés. Chaque lecture vérifie que la
 * page est bien une fiche ; à la moindre forme inattendue, on rend `null`
 * plutôt qu'une donnée devinée. Un statut d'exception faux dans un sens ou
 * dans l'autre coûte un rejet, ou un formulaire réclamé pour rien.
 */

export const BDM_IT_SOURCE = {
  name: "Base des médicaments et informations tarifaires (Assurance Maladie)",
  shortName: "BdM_IT",
  url: "http://www.codage.ext.cnamts.fr/codif/bdm_it/index_presentation.php?p_site=AMELI",
  /** La fiche d'une boîte, par son code CIP à 13 chiffres. */
  recordUrl: (cip13: string) =>
    `http://www.codage.ext.cnamts.fr/codif/bdm_it//fiche/index_fic_medisoc.php?p_code_cip=${encodeURIComponent(cip13)}&p_site=AMELI`,
  /** Le site annonce une mise à jour chaque vendredi, au fil des Journaux officiels. */
  updateCadence: "hebdomadaire",
} as const;

export type CoveragePeriod = {
  /** Date de début d'homologation aux assurés sociaux. */
  start: Date;
  /** Date de fin annoncée. Absente quand la source écrit « - ». */
  end: Date | null;
  /** « REEXAMEN », « RADIATION »… tel qu'écrit. Absent quand la source écrit « - ». */
  endReason: string | null;
};

export type BdmItRecord = {
  cip13: string;
  /** Désignation telle que la CNAM l'écrit — majuscules, DCI entre parenthèses. */
  designation: string;
  /** « A » le plus souvent. Conservé tel quel, sans interprétation. */
  nature: string | null;
  /** « Statut d'Exception » : la boîte relève de l'ordonnance de médicaments d'exception. */
  isException: boolean;
  /** « Médicament Spécifique » — conservé, jamais interprété ni affiché seul. */
  isSpecific: boolean;
  /** Homologation aux assurés sociaux, la période la plus récente en premier. */
  coverage: CoveragePeriod[];
  /** Vrai lorsque la fiche affiche « Médicament NON Remboursable aux Assurés Sociaux ». */
  notReimbursable: boolean;
  /** « MAJ : 07/09/2026 » en tête de la base BdM_IT — la date de la SOURCE. */
  sourceUpdatedAt: Date | null;
  /** « Version : 1531 » en tête de la base BdM_IT. */
  sourceVersion: string | null;
};

export type BdmItReading =
  | { kind: "RECORD"; record: BdmItRecord }
  /** La CNAM ne connaît pas ce CIP : « CIP inconnu du CEPS ». */
  | { kind: "UNKNOWN_CIP"; cip13: string }
  /** La page n'a pas la forme d'une fiche : site en panne, format changé. */
  | { kind: "UNREADABLE"; reason: string };

/** Le texte d'une page, sans balises, avec un séparateur entre cellules. */
function cellsOf(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&agrave;/gi, "à")
    .replace(/&ccedil;/gi, "ç")
    .split("\u0001")
    .map((cell) => cell.replace(/\s+/g, " ").trim())
    .filter((cell) => cell.length > 0);
}

/** « 17/08/2024 » → date UTC minuit. Toute autre forme rend `null`. */
export function parseFrenchDate(text: string | null | undefined): Date | null {
  if (!text) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return null;
  return date;
}

/** La valeur qui suit un libellé et son « : » — `null` si le libellé manque. */
function valueAfter(cells: string[], label: string): string | null {
  const index = cells.findIndex((cell) => cell === label);
  if (index < 0) return null;
  const next = cells[index + 1] === ":" ? cells[index + 2] : cells[index + 1];
  return next ?? null;
}

function yesNo(value: string | null): boolean | null {
  if (value === "Oui") return true;
  if (value === "Non") return false;
  return null;
}

/**
 * L'historique d'homologation aux assurés sociaux : après le titre, un en-tête
 * de quatre colonnes, puis des lignes de quatre cellules — date début, date
 * fin, motif fin, objet de mise à jour. La table s'arrête au premier libellé
 * qui n'est pas une date.
 */
function readCoverage(cells: string[]): CoveragePeriod[] {
  const title = cells.findIndex((cell) => cell === "Homologation Assurés Sociaux :");
  if (title < 0) return [];
  const header = cells.indexOf("Obj maj fin", title);
  if (header < 0) return [];
  const periods: CoveragePeriod[] = [];
  for (let i = header + 1; i + 3 < cells.length; i += 4) {
    const start = parseFrenchDate(cells[i]);
    if (!start) break;
    const endText = cells[i + 1];
    const end = endText === "-" ? null : parseFrenchDate(endText);
    if (endText !== "-" && !end) break;
    const reason = cells[i + 2] === "-" ? null : cells[i + 2];
    periods.push({ start, end, endReason: reason });
  }
  return periods;
}

/** « MAJ : 07/09/2026 » puis « Version : 1531 » — les premiers du bandeau, ceux de la BdM_IT. */
function readHeader(cells: string[]): { updatedAt: Date | null; version: string | null } {
  const maj = cells.findIndex((cell) => /^MAJ\s*:/.test(cell));
  const updatedAt = maj >= 0 ? parseFrenchDate(cells[maj].replace(/^MAJ\s*:\s*/, "")) : null;
  const version = cells.find((cell) => /^Version\s*:\s*\d+$/.test(cell));
  return { updatedAt, version: version ? version.replace(/^Version\s*:\s*/, "") : null };
}

export function parseBdmItRecord(html: string, expectedCip13: string): BdmItReading {
  const cells = cellsOf(html);
  if (!cells.includes("Fiche") || !cells.includes("Statut d'Exception")) {
    return { kind: "UNREADABLE", reason: "La page n'a pas la forme d'une fiche BdM_IT." };
  }
  const exceptionText = valueAfter(cells, "Statut d'Exception");
  if (exceptionText === "CIP inconnu du CEPS") return { kind: "UNKNOWN_CIP", cip13: expectedCip13 };

  const cip = valueAfter(cells, "CIP");
  if (cip !== expectedCip13) {
    return { kind: "UNREADABLE", reason: `La fiche porte le CIP ${cip ?? "absent"}, pas ${expectedCip13}.` };
  }
  const isException = yesNo(exceptionText);
  const isSpecific = yesNo(valueAfter(cells, "Médicament Spécifique"));
  if (isException === null || isSpecific === null) {
    return { kind: "UNREADABLE", reason: `Statut d'exception illisible : « ${exceptionText ?? ""} ».` };
  }
  const designation = valueAfter(cells, "Désignation");
  if (!designation) return { kind: "UNREADABLE", reason: "Désignation absente." };

  const header = readHeader(cells);
  return {
    kind: "RECORD",
    record: {
      cip13: expectedCip13,
      designation,
      nature: valueAfter(cells, "Nature du médicament"),
      isException,
      isSpecific,
      coverage: readCoverage(cells),
      notReimbursable: cells.some((cell) => /^Médicament NON Remboursable aux Assurés Sociaux/i.test(cell)),
      sourceUpdatedAt: header.updatedAt,
      sourceVersion: header.version,
    },
  };
}

/** La période d'homologation en cours ou la plus récente. */
export function currentCoverage(periods: CoveragePeriod[]): CoveragePeriod | null {
  if (periods.length === 0) return null;
  return [...periods].sort((a, b) => b.start.getTime() - a.start.getTime())[0] ?? null;
}
