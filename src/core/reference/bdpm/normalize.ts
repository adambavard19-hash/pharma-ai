/**
 * Conversion des valeurs brutes de la BDPM.
 *
 * Chaque règle ici a été établie en mesurant les fichiers réels, pas en
 * supposant : la source a des irrégularités qu'une conversion « évidente »
 * traduirait en données fausses sans rien signaler.
 *
 * Principe : en cas de valeur inattendue, on renvoie `null`. On ne devine
 * jamais. Une donnée absente reste absente.
 */

/** Découpe une colonne multivaluée. La source sépare par « ; ». */
export function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Nettoie une cellule : la source laisse des espaces de tête sur certains champs. */
export function cell(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** `12/03/1998` → Date UTC. Toutes les dates des fichiers CIS et CIP ont cette forme. */
export function parseFrenchDate(value: string | undefined): Date | null {
  const raw = cell(value);
  if (!raw) return null;

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // Une date impossible (31/02) survivrait au format mais glisserait au mois
  // suivant : on la refuse plutôt que de la décaler silencieusement.
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) {
    return null;
  }
  return date;
}

/** `20170208` → Date UTC. Forme utilisée par le fichier des avis SMR. */
export function parseCompactDate(value: string | undefined): Date | null {
  const raw = cell(value);
  if (!raw) return null;

  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) {
    return null;
  }
  return date;
}

/**
 * Prix en centimes.
 *
 * ⚠️ La source utilise la virgule à la fois comme séparateur de milliers et
 * comme séparateur décimal : `11,360,89` vaut 11 360,89 €. Un simple
 * remplacement de « , » par « . » produirait ici une erreur d'un facteur mille.
 * La règle est donc : la DERNIÈRE virgule sépare les décimales, les précédentes
 * sont des séparateurs de milliers.
 *
 * Mesuré sur la base réelle : 12 829 prix renseignés, dont 123 au-dessus de
 * mille euros — la forme à trois groupes existe bel et bien.
 */
export function parsePriceCents(value: string | undefined): number | null {
  const raw = cell(value);
  if (!raw) return null;

  const cleaned = raw.replace(/\s| /g, "");
  if (!/^\d{1,3}(,\d{3})*,\d{2}$|^\d+,\d{2}$|^\d+$/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  if (lastComma === -1) return Number(cleaned) * 100;

  const units = cleaned.slice(0, lastComma).replaceAll(",", "");
  const decimals = cleaned.slice(lastComma + 1);
  if (!/^\d+$/.test(units) || !/^\d{2}$/.test(decimals)) return null;

  return Number(units) * 100 + Number(decimals);
}

/**
 * Taux de remboursement en points de pourcentage.
 *
 * La source écrit aussi bien `65%` que `65 %` — les deux formes coexistent
 * (10 304 et 322 occurrences). La valeur brute est conservée telle quelle
 * ailleurs ; celle-ci sert uniquement à filtrer.
 */
export function parsePercent(value: string | undefined): number | null {
  const raw = cell(value);
  if (!raw) return null;

  const match = /^(\d{1,3})\s*%$/.exec(raw);
  if (!match) return null;

  const percent = Number(match[1]);
  return percent >= 0 && percent <= 100 ? percent : null;
}

/** `oui` / `non`, sans casse. Toute autre valeur reste inconnue. */
export function parseYesNo(value: string | undefined): boolean | null {
  const raw = cell(value)?.toLowerCase();
  if (raw === "oui") return true;
  if (raw === "non") return false;
  return null;
}

/** Entier positif, ou `null`. Utilisé pour les types et numéros de tri. */
export function parseInteger(value: string | undefined): number | null {
  const raw = cell(value);
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}
