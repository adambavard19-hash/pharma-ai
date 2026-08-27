import type { AIProvider, ExplanationRequest, PatientReasonRequest, ProviderInfo } from "../ports";
import type { TreatmentExplanationResult } from "../types";

/**
 * Fournisseur d'explication DÉTERMINISTE (sans modèle de langage).
 *
 * Il n'invente rien : il assemble uniquement des informations déjà présentes
 * dans l'entrée `DrugKnowledge`, c'est-à-dire dans le référentiel branché.
 * Si le référentiel ne fournit pas d'explication, le résultat est marqué
 * `UNAVAILABLE` et aucune phrase n'est produite.
 *
 * C'est le fournisseur par défaut : il garantit qu'aucun fait médical ne
 * provient d'un modèle génératif tant qu'un modèle n'a pas été explicitement
 * configuré et encadré.
 */
export class RuleBasedAIProvider implements AIProvider {
  readonly info: ProviderInfo = {
    id: "rule-based",
    label: "Reformulation déterministe",
    capability: "SIMULATED",
    description:
      "Assemble uniquement les informations du référentiel médicamenteux. Aucun modèle génératif n'intervient, aucun fait n'est ajouté.",
  };

  async explainTreatment(request: ExplanationRequest): Promise<TreatmentExplanationResult> {
    const { drug, posology, durationDays } = request;

    if (!drug.patientExplanation) {
      return {
        lineIndex: -1,
        purpose: null,
        instructions: null,
        tips: [],
        precautions: [],
        source: "UNAVAILABLE",
        sourceRefs: [],
        confidence: 0,
        requiresReview: true,
      };
    }

    const instructions = [
      posology,
      durationDays ? `Durée indiquée : ${durationDays} jours.` : null,
      drug.intakeAdvice,
    ]
      .filter(Boolean)
      .join(" ");

    const precautions: string[] = [];
    if (drug.cautionPopulations.length > 0) {
      precautions.push(
        `Vigilance particulière : ${drug.cautionPopulations.join(", ")}.`,
      );
    }
    if (request.patient.isPregnant || request.patient.isBreastfeeding) {
      precautions.push(
        "Grossesse ou allaitement déclaré : à confirmer avec le pharmacien.",
      );
    }

    return {
      lineIndex: -1,
      purpose: drug.patientExplanation,
      instructions: instructions || null,
      tips: drug.intakeAdvice ? [drug.intakeAdvice] : [],
      precautions,
      source: drug.isDemoData ? "DEMO" : "REFERENTIAL",
      sourceRefs: [`${drug.sourceName} ${drug.sourceVersion}`],
      confidence: drug.isDemoData ? 0.5 : 0.9,
      requiresReview: true,
    };
  }

  async writePatientReason(request: PatientReasonRequest): Promise<string> {
    const claim = request.productClaims[0];
    if (claim) {
      return `${claim} — proposé dans le cadre de ${request.opportunityTitle.toLowerCase()}.`;
    }
    return `Votre pharmacien vous propose ${request.productName} dans le cadre de ${request.opportunityTitle.toLowerCase()}.`;
  }
}
