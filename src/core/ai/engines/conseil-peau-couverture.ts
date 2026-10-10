import { ADVICE_RULES } from "./advice";
import { VIGILANCE_RULES } from "./vigilance";

/**
 * « Conseil peau — Série 2 » et ce que chaque ligne est devenue dans le moteur.
 *
 * Le document est la source ; ce fichier est la table de correspondance (comme
 * `base-maitre.ts` pour la Base maître V1). Une ligne est portée par au moins une
 * règle de conseil ET une vigilance, ou par l'une des deux avec une raison écrite.
 * Un test l'impose : aucune ligne ne peut disparaître en silence. La série
 * suivante s'ajoute ici, avec son identifiant. Les séries 1, 3, 4 et 5 (reçues les 7 et 8 octobre 2026)
 * suivent la même forme : `SKIN_SERIES_n` + `SKIN_SERIES_n_ROWS` + `skinSeriesCoverage(id, rows)`.
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

/** Pour chaque ligne d'un document, les règles de conseil et les vigilances qui la portent (même contrôle pour toutes les séries). */
export function skinSeriesCoverage(documentId: string, rows: SeriesRow[]): SeriesCoverage[] {
  return rows.map(({ row }) => ({
    row,
    advice: ADVICE_RULES.filter((rule) => rule.documentRows?.document === documentId && rule.documentRows.rows.includes(row)).map((rule) => rule.key),
    vigilances: VIGILANCE_RULES.filter((rule) => rule.documentRows?.document === documentId && rule.documentRows.rows.includes(row)).map((rule) => rule.key),
  }));
}

export const SKIN_SERIES_1 = {
  id: "peau-serie-1",
  name: "PharmaBoost — Médicaments déclencheurs et produits conseil (première série : peau et antibiotiques)",
  receivedAt: "2026-10-07",
} as const;

export const SKIN_SERIES_1_ROWS: SeriesRow[] = [
  { row: 1, trigger: "Isotrétinoïne orale — Curacné, Procuta, Acnetrait… — lèvres", atc: "D10BA01", question: "Un soin pour prévenir la sécheresse des lèvres ?" },
  { row: 2, trigger: "Isotrétinoïne orale — hydratant", atc: "D10BA01", question: "La peau tiraille-t-elle ? Quel hydratant ?" },
  { row: 3, trigger: "Isotrétinoïne orale — yeux", atc: "D10BA01", question: "Yeux secs ? Lentilles ?" },
  { row: 4, trigger: "Adapalène — Differine — hydratant", atc: "D10AD03", question: "Peau sèche ou irritée depuis le début du traitement ?" },
  { row: 5, trigger: "Adapalène — Differine — protection solaire", atc: "D10AD03", question: "Comment protégez-vous votre peau du soleil ?" },
  { row: 6, trigger: "Antibiotique oral — amoxicilline, amoxicilline/acide clavulanique… — probiotique", atc: "J01", question: "Déjà eu une diarrhée sous antibiotique ? Des symptômes actuellement ?" },
];

export const SKIN_SERIES_3 = {
  id: "peau-serie-3",
  name: "PharmaBoost — Conseil peau — Série 3 (rosacée et hygiène cutanée ; mycoses, psoriasis et après-gale)",
  receivedAt: "2026-10-08",
} as const;

export const SKIN_SERIES_3_ROWS: SeriesRow[] = [
  { row: 1, trigger: "Métronidazole cutané — Rozex 0,75 %, crème (rosacée)", atc: "D06BX01", question: "Quel nettoyant ? La peau pique-t-elle après la toilette ?" },
  { row: 2, trigger: "Ivermectine cutanée — Soolantra 10 mg/g, crème (rosacée de l'adulte)", atc: "D11AX22", question: "Peau sèche ? Hydratant avant ou après Soolantra ?" },
  { row: 3, trigger: "Acide azélaïque — Finacea 15 %, gel (rosacée confirmée)", atc: "D10AX03", question: "Le gel provoque-t-il des picotements ? Peeling ou sérum anti-imperfections ?" },
  { row: 4, trigger: "Kétoconazole cutané — Kétoderm 2 %, crème (dermatophytie de l'adulte)", atc: "D01AC08", question: "Quelle mycose ? Le lavant irrite-t-il les zones atteintes ?" },
  { row: 5, trigger: "Terbinafine cutanée — Terbinafine Biogaran 1 %, crème (mycose confirmée)", atc: "D01AE15", question: "Quelle zone ? Le lavant irrite-t-il ? Plis et orteils bien séchés ?" },
  { row: 6, trigger: "Calcipotriol — Daivonex 50 µg/g, crème (psoriasis)", atc: "D05AX02", question: "Un émollient quotidien ? D'autres traitements au calcipotriol ?" },
  { row: 7, trigger: "Calcipotriol + bétaméthasone — Daivobet, pommade (psoriasis du corps)", atc: "D05AX52", question: "La peau reste-t-elle sèche ? Une autre crème cortisonée sur les plaques ?" },
  { row: 8, trigger: "Perméthrine — Topiscab 5 %, crème (gale : soins de confort)", atc: "P03AC04", question: "Peau sèche ou irritée après le traitement ? Nouvelles lésions ?" },
];

export const SKIN_SERIES_4 = {
  id: "peau-serie-4",
  name: "PharmaBoost — Conseil peau — Série 4 (rétinoïdes oraux, acné et rosacée ; atopie, psoriasis et candidose cutanée)",
  receivedAt: "2026-10-08",
} as const;

export const SKIN_SERIES_4_ROWS: SeriesRow[] = [
  { row: 1, trigger: "Acitrétine orale — Soriatane", atc: "D05BB02", question: "Lèvres sèches ou fendillées ? Un baume adapté ?" },
  { row: 2, trigger: "Alitrétinoïne orale — Toctino (eczéma chronique sévère des mains)", atc: "D11AH04", question: "Les mains tiraillent-elles ? Que mettez-vous après les lavages ?" },
  { row: 3, trigger: "Érythromycine cutanée — Erythrogel 4 %", atc: "D10AF02", question: "Peau sèche depuis le début du gel ? Sérum exfoliant ?" },
  { row: 4, trigger: "Brimonidine cutanée — Mirvaso 3 mg/g (rougeurs de rosacée de l'adulte)", atc: "D11AX21", question: "Besoin d'un hydratant ? Les rougeurs s'aggravent-elles après le gel ?" },
  { row: 5, trigger: "Dupilumab injectable — Dupixent (dermatite atopique confirmée)", atc: "D11AH05", question: "Hydratation quotidienne ? Le soin actuel convient-il ?" },
  { row: 6, trigger: "Clobétasol cutané — Dermoval 0,05 %, crème (psoriasis du corps)", atc: "D07AD01", question: "Pour quelle affection ? Un émollient pour les zones sèches ?" },
  { row: 7, trigger: "Clobétasol, shampooing — Clobex 500 µg/g (psoriasis du cuir chevelu de l'adulte)", atc: "D07AD01", question: "Besoin d'un shampooing doux pour compléter le rinçage ?" },
  { row: 8, trigger: "Éconazole cutané — Éconazole Viatris 1 %, crème (candidose cutanée confirmée)", atc: "D01AC03", question: "Quelle zone ? Quel lavant ? Un anticoagulant antivitamine K ?" },
];

export const SKIN_SERIES_5 = {
  id: "peau-serie-5",
  name: "PharmaBoost — Conseil peau — Série 5 (acné, psoriasis et photoprotection ; atopie et kératoses actiniques)",
  receivedAt: "2026-10-07",
} as const;

export const SKIN_SERIES_5_ROWS: SeriesRow[] = [
  { row: 1, trigger: "Trifarotène cutané — Aklief 50 µg/g, crème", atc: "D10AD06", question: "Un hydratant dès le début ? La peau tire-t-elle ou pèle-t-elle ?" },
  { row: 2, trigger: "Isotrétinoïne cutanée — Roaccutane 0,05 %, gel (forme locale)", atc: "D10AD04", question: "Comment protégez-vous votre visage du soleil ? Un solaire adapté ?" },
  { row: 3, trigger: "Ciclosporine orale — Néoral (psoriasis ou dermatite atopique)", atc: "L04AD01", question: "Quelle protection solaire ? Des compléments pour le stress ou le sommeil ?" },
  { row: 4, trigger: "Aprémilast oral — Otezla (psoriasis cutané confirmé)", atc: "L04AA32", question: "Peau sèche ? Des compléments pour le sommeil ou le moral ?" },
  { row: 5, trigger: "Tralokinumab injectable — Adtralza (dermatite atopique)", atc: "D11AH07", question: "Un émollient quotidien conservé, bien toléré et appliqué ?" },
  { row: 6, trigger: "Calcitriol cutané — Silkis 3 µg/g, pommade (psoriasis)", atc: "D05AX03", question: "Peau sèche ? Gommage sur les plaques ? Compléments calcium/vitamine D ?" },
  { row: 7, trigger: "Fluorouracile cutané — Efudix 5 %, crème (kératoses actiniques)", atc: "L01BC02", question: "Protection solaire de la zone traitée ? Zone érodée ou douloureuse ?" },
  { row: 8, trigger: "Imiquimod cutané — Zyclara 3,75 %, crème (kératoses actiniques)", atc: "D06BB10", question: "Quel solaire ? Quand laver la crème ? Quels soins validés ?" },
];

/** Le nom lisible de chaque document reçu, par identifiant : la console s'en sert pour dire d'où vient une règle. */
export const SKIN_DOCUMENT_NAMES: Record<string, string> = Object.fromEntries(
  [SKIN_SERIES_1, SKIN_SERIES_2, SKIN_SERIES_3, SKIN_SERIES_4, SKIN_SERIES_5].map((series) => [series.id, series.name]),
);
