import type { DrugClassification } from "@/core/understanding";
import { OFFICIAL_ATC_SOURCE } from "@/core/reference/atc/official-atc";
import type { DrugKnowledge } from "./types";

/**
 * La fiche d'une ligne sans fiche éditoriale, faite de sa classification.
 *
 * Elle suffit à déclencher une règle de conseil par code ATC ; elle ne porte ni explication patient ni interaction, et
 * le moteur de sécurité le signale. Deux origines, qui ne se confondent jamais :
 *   • `AI_CLASSIFICATION` — le modèle a classé le médicament (en cache ou à l'instant) ;
 *   • `OFFICIAL_ATC` — le modèle n'a pas répondu, la famille est celle de l'Assurance Maladie (Open Medic joint à la
 *     BDPM). Une règle ne s'y déclenche que par le code : son libellé est un intitulé de l'arbre ATC, pas une classe
 *     écrite pour nos règles (voir `engines/advice.ts`).
 *
 * La substance publiée par le catalogue national prime toujours sur celle que le modèle croit reconnaître : l'une est
 * un fait, l'autre une lecture.
 */
export function classifiedDrugKnowledge(params: {
  key: string;
  drugName: string;
  form: string | null;
  classification: DrugClassification;
  /** Première substance publiée par le catalogue national pour la spécialité rattachée, s'il y en a une. */
  publishedSubstance: string | null;
  /** Le modèle qui a classé, pour la trace. */
  model: string;
}): DrugKnowledge {
  const official = params.classification.source === "OFFICIAL";
  return {
    id: `${official ? "official" : "ai"}:${params.key}`,
    name: params.drugName,
    inn: params.publishedSubstance ?? params.classification.substance,
    atcCode: params.classification.atcCode,
    therapeuticClass: params.classification.therapeuticClass,
    form: params.form,
    commonSideEffects: params.classification.commonSideEffects,
    interactionClasses: [],
    cautionPopulations: [],
    patientExplanation: null,
    intakeAdvice: null,
    sourceName: official ? OFFICIAL_ATC_SOURCE.name : "Classification IA",
    sourceVersion: official ? `base complète ${OFFICIAL_ATC_SOURCE.year}` : params.model,
    isDemoData: false,
    origin: official ? "OFFICIAL_ATC" : "AI_CLASSIFICATION",
  };
}
