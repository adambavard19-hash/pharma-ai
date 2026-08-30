import type { ScoreContribution } from "@/core/ai/types";

/**
 * Formes de données partagées par les trois zones de l'écran de vente.
 *
 * Elles sont sérialisables : la page serveur les construit depuis Prisma, les
 * composants clients ne voient jamais un modèle de base de données.
 */

/**
 * Les faits officiels d'une ligne rattachée au catalogue national.
 *
 * Aucun texte rédigé ici : ce bloc ne contient que ce que la source publie. Il
 * s'affiche à côté du libellé de l'ordonnance, jamais à sa place — le texte du
 * prescripteur reste la référence de ce qui a été prescrit.
 */
export type OfficialLineFacts = {
  cisCode: string;
  name: string;
  pharmaceuticalForm: string | null;
  substances: string[];
  prescriptionConditions: string[];
  marketed: boolean;
};

/** Une spécialité proposée au pharmacien quand le rattachement a un doute. */
export type SpecialtyProposal = {
  id: string;
  cisCode: string;
  name: string;
  pharmaceuticalForm: string | null;
  substances: string[];
  marketed: boolean;
  score: number;
  reasons: string[];
};

export type SaleLineDraft = {
  id: string;
  position: number;
  rawText: string | null;
  drugName: string;
  dosage: string;
  form: string;
  posology: string;
  durationDays: number | null;
  quantity: number | null;
  instructions: string;
  confidence: Record<string, number>;
  unreadableFields: string[];
  confirmed: boolean;
  /** Explication de traitement, disponible une fois l'analyse passée. */
  purpose: string | null;
  explanationSource: string | null;
  /** Faits officiels, si la ligne a été rattachée au catalogue national. */
  official: OfficialLineFacts | null;
  /**
   * Ce que l'officine détient de CE médicament. La première question du
   * pharmacien, à laquelle Pharma.ai ne savait pas répondre jusqu'ici.
   */
  availability: {
    state: "IN_STOCK" | "REFERENCED_EMPTY" | "NOT_REFERENCED" | "UNKNOWN";
    quantity: number;
  } | null;
  identifiedBy: "AUTO" | "PHARMACIST" | "SCAN" | null;
  /** Ce que le catalogue propose quand le rattachement n'a pas pu se faire seul. */
  candidates: SpecialtyProposal[];
  /** Pourquoi le rattachement automatique a été refusé, en clair. */
  identificationRefusal: string | null;
};

export type SafetyFindingView = {
  id: string;
  severity: string;
  code: string;
  message: string;
  /** ANALYSIS · PRESCRIPTION_LINE · OPPORTUNITY · PRODUCT */
  subjectType: string;
  acknowledged: boolean;
};


export type AdviceView = {
  id: string;
  status: string;
  origin: string;
  totalScore: number;
  justification: string;
  /**
   * La raison en une ligne, produite par la règle de conseil (lot A). C'est
   * elle que lit le pharmacien au comptoir ; la version longue reste à un clic.
   */
  shortReason: string | null;
  /** Ce qui sera écrit sur la fiche remise au patient. */
  patientReason: string | null;
  /** Ce que le pharmacien dit au comptoir, issu de la règle de conseil. */
  counterScript: string | null;
  precautions: string[];
  quantity: number;
  unitPriceCents: number;
  pharmacistNote: string | null;
  decidedBy: string | null;
  explanation: ScoreContribution[];
  opportunity: {
    title: string;
    rationale: string;
    clinicalContext: string | null;
    priority: number;
    safetyNotes: string[];
  } | null;
  product: {
    id: string;
    name: string;
    brand: string | null;
    imageUrl: string | null;
    salePriceCents: number;
    quantity: number;
    alertThreshold: number;
    claims: string[];
  } | null;
};

/**
 * Ce qui, dans le dossier du patient, a RÉELLEMENT pesé sur cette analyse.
 *
 * Pas la fiche patient : seulement les facteurs que le moteur a consommés. Une
 * information sans incidence sur cette délivrance n'a pas à occuper l'écran du
 * comptoir — elle reste à un clic, sur la fiche.
 */
export type PatientFactor = {
  label: string;
  /** `warning` : à surveiller · `neutral` : contexte simple. */
  tone: "warning" | "neutral";
};

export type BlockedOpportunityView = {
  id: string;
  title: string;
  blockReason: string | null;
};
