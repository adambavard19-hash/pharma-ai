import { NEED_DEFINITIONS, type NeedKey } from "./needs";
import type {
  DrugClassification,
  IdentifiedNeed,
  TreatmentUnderstanding,
  UnderstandingPatient,
} from "./types";

/**
 * Le contexte et les besoins, dérivés des classifications — sans appel.
 *
 * Une fois chaque médicament classé (code ATC), ce que l'ordonnance raconte
 * se lit dans les familles présentes : un antibiotique avec un antitussif et
 * un antihistaminique, c'est un contexte respiratoire infectieux sur terrain
 * allergique. Ces règles sont écrites, versionnées, relisibles — et elles
 * s'exécutent en une milliseconde au comptoir.
 *
 * Chaque règle dit quand un besoin est PLAUSIBLE, et quand il ne l'est pas
 * (déjà couvert par l'ordonnance). Le besoin n'est pas un conseil : la règle
 * de conseil pose ensuite sa question au patient, puis le stock et la
 * sécurité décident.
 *
 * ⚠️ À valider par un pharmacien, comme les règles de conseil.
 */

type Context = {
  /** Vrai si un code ATC de l'ordonnance commence par l'un de ces préfixes. */
  has: (...prefixes: string[]) => boolean;
  /** Les index de lignes dont l'ATC commence par l'un de ces préfixes. */
  lines: (...prefixes: string[]) => number[];
  patient: UnderstandingPatient;
};

type ContextRule = {
  need: NeedKey;
  /** Préfixes ATC qui motivent le besoin ; ils nomment aussi les lignes citées. */
  triggers: string[];
  /** Préfixes ATC qui couvrent déjà le besoin : la règle se tait alors. */
  coveredBy?: string[];
  when?: (context: Context) => boolean;
  confidence: number;
  justification: string;
};

export const CONTEXT_RULES: ContextRule[] = [
  {
    need: "ANTIBIOTIC_DIGESTIVE_TOLERANCE",
    triggers: ["J01"],
    coveredBy: ["A07F"],
    confidence: 0.9,
    justification:
      "Antibiothérapie par voie orale : les troubles digestifs sont fréquents pendant la cure, et rien ne les prévient sur l'ordonnance.",
  },
  {
    need: "FEVER_MONITORING",
    triggers: ["J01"],
    when: (c) => c.has("N02BE", "M01A") || c.patient.ageYears === null || c.patient.ageYears < 12 || c.patient.ageYears >= 75,
    confidence: 0.55,
    justification:
      "Contexte infectieux avec antalgique ou antipyrétique : la température se suit à domicile pour juger de l'évolution.",
  },
  {
    need: "NASAL_CONGESTION",
    triggers: ["R03", "R05", "R06", "J01FA", "J01CA"],
    coveredBy: ["R01"],
    when: (c) => c.has("R03", "R05", "R06", "R01") || c.has("J01FA"),
    confidence: 0.6,
    justification:
      "Contexte respiratoire ou ORL : une gêne nasale est fréquente, et aucun traitement local du nez n'est prescrit.",
  },
  {
    need: "SORE_THROAT",
    triggers: ["J01FA", "J01CA", "R05", "R02"],
    coveredBy: ["R02"],
    when: (c) => c.has("J01FA", "R05") || (c.has("J01CA") && c.has("N02BE")),
    confidence: 0.55,
    justification:
      "Contexte ORL probable : l'irritation de la gorge est fréquente et n'est pas prise en charge par l'ordonnance.",
  },
  {
    need: "COUGH_COMFORT",
    triggers: ["R03", "J01FA"],
    coveredBy: ["R05"],
    confidence: 0.5,
    justification:
      "Contexte respiratoire sans traitement de la toux : une toux irritante reste plausible.",
  },
  {
    need: "ALLERGIC_EYE_IRRITATION",
    triggers: ["R06"],
    coveredBy: ["S01G"],
    confidence: 0.55,
    justification:
      "Antihistaminique par voie orale : une irritation des yeux accompagne souvent la rhinite allergique, et rien ne la traite localement.",
  },
  {
    need: "DRY_MOUTH",
    triggers: ["N06A", "N05A", "R06AA", "R06AB", "R06AD", "G04BD", "N04A"],
    confidence: 0.6,
    justification:
      "Traitement à effet anticholinergique documenté : la sécheresse buccale est un effet fréquent.",
  },
  {
    need: "FATIGUE_CRAMPS",
    triggers: ["N05B", "N06A"],
    confidence: 0.5,
    justification:
      "Anxiolytique ou antidépresseur : une fatigue ou des crampes sont fréquemment rapportées au comptoir.",
  },
  {
    need: "PHOTOSENSITIVITY",
    triggers: ["J01AA", "J01M", "C03", "D10BA", "L01"],
    confidence: 0.9,
    justification: "Médicament photosensibilisant documenté : l'exposition au soleil demande une précaution.",
  },
  {
    need: "SKIN_DRYNESS",
    triggers: ["D10", "D07", "D05", "D11AX"],
    confidence: 0.7,
    justification:
      "Traitement dermatologique dont la sécheresse cutanée est un effet fréquent.",
  },
  {
    need: "GASTRIC_DISCOMFORT",
    triggers: ["M01A", "H02"],
    coveredBy: ["A02BC", "A02BA"],
    confidence: 0.75,
    justification:
      "Anti-inflammatoire ou corticoïde par voie orale sans protection gastrique prescrite.",
  },
  {
    need: "CONSTIPATION",
    triggers: ["B03A", "N02A", "A03"],
    coveredBy: ["A06"],
    confidence: 0.7,
    justification: "Traitement dont la constipation est un effet fréquent, sans laxatif prescrit.",
  },
  {
    need: "REHYDRATION",
    triggers: ["A07", "A04", "J01"],
    when: (c) =>
      c.has("A07", "A04") ||
      (c.has("J01") && c.patient.ageYears !== null && (c.patient.ageYears < 6 || c.patient.ageYears >= 80)),
    confidence: 0.6,
    justification:
      "Diarrhée ou vomissements plausibles dans ce contexte, chez une personne à risque de déshydratation.",
  },
];

/** Les familles thérapeutiques présentes, nommées pour le pharmacien. */
const GROUPS: { prefixes: string[]; label: string }[] = [
  { prefixes: ["J01", "J02", "J05", "P01"], label: "infectieux" },
  { prefixes: ["R03", "R05", "R01", "R02"], label: "respiratoire" },
  { prefixes: ["R06"], label: "allergique" },
  { prefixes: ["N02", "M01A"], label: "douleur ou fièvre" },
  { prefixes: ["A02", "A03", "A04", "A06", "A07"], label: "digestif" },
  { prefixes: ["D"], label: "dermatologique" },
  { prefixes: ["N05", "N06"], label: "psychotrope" },
  { prefixes: ["C"], label: "cardiovasculaire" },
  { prefixes: ["H02"], label: "corticothérapie" },
  { prefixes: ["B03"], label: "carence en fer" },
  { prefixes: ["A10"], label: "diabète" },
  { prefixes: ["M05B", "H05"], label: "osseux" },
];

export function deriveUnderstanding(params: {
  drugs: DrugClassification[];
  patient: UnderstandingPatient;
  providerId: string;
  model: string;
  warnings?: string[];
  usage?: TreatmentUnderstanding["usage"];
}): TreatmentUnderstanding {
  const classified = params.drugs.filter((drug) => drug.atcCode);
  const has = (...prefixes: string[]) =>
    classified.some((drug) => prefixes.some((prefix) => drug.atcCode!.startsWith(prefix)));
  const lines = (...prefixes: string[]) =>
    classified
      .filter((drug) => prefixes.some((prefix) => drug.atcCode!.startsWith(prefix)))
      .map((drug) => drug.lineIndex);
  const context: Context = { has, lines, patient: params.patient };

  const needs: IdentifiedNeed[] = [];
  for (const rule of CONTEXT_RULES) {
    if (!has(...rule.triggers)) continue;
    if (rule.coveredBy && has(...rule.coveredBy)) continue;
    if (rule.when && !rule.when(context)) continue;
    needs.push({
      key: rule.need,
      lineIndexes: lines(...rule.triggers),
      justification: rule.justification,
      confidence: rule.confidence,
    });
  }
  needs.sort((a, b) => b.confidence - a.confidence);

  const groups = GROUPS.filter((group) => has(...group.prefixes)).map((group) => group.label);
  const summary =
    groups.length > 0
      ? `Contexte probable : ${groups.join(", ")}.`
      : classified.length > 0
        ? "Aucun contexte particulier dérivé de l'ordonnance."
        : "";

  return {
    drugs: params.drugs,
    context: {
      summary,
      confidence: classified.length === 0 ? 0 : Math.min(1, classified.length / Math.max(1, params.drugs.length)),
      groups,
    },
    needs,
    providerId: params.providerId,
    model: params.model,
    warnings: params.warnings ?? [],
    usage: params.usage ?? null,
    cachedCount: params.drugs.filter((drug) => drug.source === "CACHE").length,
  };
}

/** Le libellé d'un besoin, pour la trace et l'administration. */
export function needLabel(key: NeedKey): string {
  return NEED_DEFINITIONS[key].label;
}
