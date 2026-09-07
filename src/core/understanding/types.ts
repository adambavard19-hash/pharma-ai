import type { NeedKey } from "./needs";

/**
 * La compréhension du traitement.
 *
 * Deux moitiés, et une frontière nette entre elles :
 *   1. la CLASSIFICATION de chaque médicament (substance, ATC, classe) —
 *      la seule chose demandée au modèle, mise en cache par médicament ;
 *   2. le CONTEXTE et les BESOINS, dérivés localement de ces classifications
 *      par des règles écrites (`context.ts`) — sans appel, en une
 *      milliseconde, et relisibles.
 *
 * Ni l'une ni l'autre ne propose un produit ni ne rédige pour le patient.
 */

export type UnderstandingLine = {
  lineIndex: number;
  drugName: string;
  dosage: string | null;
  form: string | null;
  posology: string | null;
  durationDays: number | null;
  /** Nom officiel, quand la ligne est rattachée au catalogue national. */
  officialName: string | null;
  /**
   * Substances publiées : celles de la spécialité rattachée, ou, à défaut,
   * celles que toutes les spécialités candidates ont en commun.
   */
  officialSubstances: string[];
};

/**
 * Le contexte patient utile aux règles de besoin.
 *
 * Volontairement réduit : rien de tout cela ne part au modèle — la
 * classification n'en a pas besoin. Allergies, pathologies et traitements en
 * cours restent au moteur de sécurité local.
 */
export type UnderstandingPatient = {
  ageYears: number | null;
  sex: "FEMALE" | "MALE" | "UNSPECIFIED";
  isPregnant: boolean | null;
  isBreastfeeding: boolean | null;
};

export type ClassificationRequest = {
  lines: UnderstandingLine[];
};

/** Ce que le modèle affirme d'un médicament. Validé avant tout usage. */
export type DrugClassification = {
  lineIndex: number;
  substance: string | null;
  /** Code ATC, contrôlé par expression régulière. `null` si absent ou invalide. */
  atcCode: string | null;
  therapeuticClass: string | null;
  commonSideEffects: string[];
  confidence: number;
  /** `CACHE` : classé lors d'une ordonnance précédente ; `MODEL` : classé à l'instant. */
  source: "MODEL" | "CACHE";
};

export type ClassificationResult = {
  drugs: DrugClassification[];
  providerId: string;
  model: string;
  warnings: string[];
  usage: { inputTokens: number; outputTokens: number; durationMs: number } | null;
};

/** Un besoin complémentaire dérivé du contexte, à confronter aux règles de conseil. */
export type IdentifiedNeed = {
  key: NeedKey;
  lineIndexes: number[];
  /** Pourquoi, en une phrase, pour le pharmacien. Jamais montré au patient. */
  justification: string;
  confidence: number;
};

export type TreatmentUnderstanding = {
  drugs: DrugClassification[];
  context: {
    /** Le contexte thérapeutique probable, en une phrase prudente. */
    summary: string;
    confidence: number;
    /** Les familles présentes sur l'ordonnance, telles que dérivées des ATC. */
    groups: string[];
  };
  needs: IdentifiedNeed[];
  providerId: string;
  model: string;
  /** Ce qui a été écarté à la validation, en clair, pour la trace. */
  warnings: string[];
  usage: { inputTokens: number; outputTokens: number; durationMs: number } | null;
  /** Nombre de lignes classées depuis le cache, sans appel. */
  cachedCount: number;
};

/**
 * La réponse brute du modèle, avant validation.
 */
export type ClaimedClassification = {
  medicaments: {
    ligne: number;
    substance: string;
    code_atc: string;
    classe_therapeutique: string;
    confiance: number;
  }[];
};

export type RejectedUnderstanding = {
  subject: string;
  reason: string;
};
