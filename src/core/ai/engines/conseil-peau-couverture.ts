import { ADVICE_RULES } from "./advice";
import { VIGILANCE_RULES } from "./vigilance";

/**
 * « Conseil peau — Série 2 » et ce que chaque ligne est devenue dans le moteur.
 *
 * Le document est la source ; ce fichier est la table de correspondance (comme
 * `base-maitre.ts` pour la Base maître V1). Une ligne est portée par au moins une
 * règle de conseil ET une vigilance, ou par l'une des deux avec une raison écrite.
 * Un test l'impose : aucune ligne ne peut disparaître en silence. La série
 * suivante s'ajoute ici, avec son identifiant.
 */

export const SKIN_SERIES_2 = {
  id: "peau-serie-2",
  name: "PharmaBoost — Conseil peau — Série 2 (acné et photoprotection ; eczéma et cuir chevelu)",
  receivedAt: "2026-10-07",
} as const;

export type SeriesRow = {
  row: number;
  /** Le déclencheur, tel que le document le nomme. */
  trigger: string;
  /** Préfixe ATC par lequel le moteur le reconnaît. */
  atc: string;
  /** Pour chaque ligne : ce que le document dit, résumé. */
  question: string;
};

export const SKIN_SERIES_2_ROWS: SeriesRow[] = [
  { row: 1, trigger: "Peroxyde de benzoyle — Cutacnyl 2,5 %", atc: "D10AE", question: "Peau qui tiraille ou pèle ? Déjà un hydratant ?" },
  { row: 2, trigger: "Adapalène + peroxyde de benzoyle — Epiduo 0,1 %/2,5 %", atc: "D10AD53", question: "Sécheresse ou irritation sous le gel ?" },
  { row: 3, trigger: "Trétinoïne cutanée — Effederm 0,05 %, crème", atc: "D10AD01", question: "Peau sèche ? Gommages ou acides ?" },
  { row: 4, trigger: "Doxycycline orale — ex. Doxycycline Sandoz 100 mg", atc: "J01AA02", question: "Exposé au soleil (travail, déplacements) ?" },
  { row: 5, trigger: "Dermocorticoïde cutané (Locoid, Diprosone…) — si eczéma atopique confirmé", atc: "D07A", question: "Pour quelle affection ? Un émollient quotidien ?" },
  { row: 6, trigger: "Locoid / Diprosone — si eczéma atopique confirmé — hygiène", atc: "D07A", question: "Avec quoi se laver ? Est-ce que cela dessèche ?" },
  { row: 7, trigger: "Tacrolimus cutané — Protopic pommade", atc: "D11AH01", question: "Un émollient ? À quel moment par rapport à Protopic ?" },
  { row: 8, trigger: "Ciclopirox olamine 1,5 % — shampooing Gerda", atc: "D01AE14", question: "Quel shampooing entre les applications ?" },
];

export type SeriesCoverage = {
  row: number;
  advice: string[];
  vigilances: string[];
};

/** Pour chaque ligne du document, les règles de conseil et les vigilances qui la portent. */
export function skinSeries2Coverage(): SeriesCoverage[] {
  return SKIN_SERIES_2_ROWS.map(({ row }) => ({
    row,
    advice: ADVICE_RULES.filter((rule) => rule.documentRows?.document === SKIN_SERIES_2.id && rule.documentRows.rows.includes(row)).map((rule) => rule.key),
    vigilances: VIGILANCE_RULES.filter((rule) => rule.documentRows?.document === SKIN_SERIES_2.id && rule.documentRows.rows.includes(row)).map((rule) => rule.key),
  }));
}
