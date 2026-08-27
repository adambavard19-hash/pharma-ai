/**
 * Ports du moteur Pharma.ai (architecture hexagonale).
 *
 * Le moteur métier ne connaît QUE ces interfaces. Brancher un nouveau modèle,
 * un nouvel OCR ou une nouvelle base médicamenteuse consiste à écrire un
 * adaptateur dans `src/core/ai/providers/` et à le déclarer dans le registre —
 * aucune règle métier n'est touchée.
 */

import type {
  DrugKnowledge,
  ExtractedPrescription,
  PatientContext,
  TreatmentExplanationResult,
} from "../types";

export type ProviderCapability = "SIMULATED" | "LIVE";

export type ProviderInfo = {
  id: string;
  label: string;
  capability: ProviderCapability;
  /** Description affichée dans les paramètres, en français. */
  description: string;
};

// --- OCR / extraction ------------------------------------------------------

export type OcrInput = {
  fileKey: string | null;
  mimeType: string | null;
  fileName: string | null;
  /** Contenu binaire lorsqu'il est disponible en mémoire. */
  bytes?: Uint8Array;
  /** Identifiant de scénario, utilisé par le fournisseur de démonstration. */
  demoScenarioId?: string;
};

export interface OCRProvider {
  readonly info: ProviderInfo;
  extract(input: OcrInput): Promise<ExtractedPrescription>;
}

// --- Référentiel médicamenteux --------------------------------------------

export interface DrugKnowledgeProvider {
  readonly info: ProviderInfo;
  /** Recherche par nom commercial ou DCI. `null` si non trouvé — jamais inventé. */
  lookup(drugName: string): Promise<DrugKnowledge | null>;
  lookupMany(drugNames: string[]): Promise<Map<string, DrugKnowledge | null>>;
  search(query: string, limit?: number): Promise<DrugKnowledge[]>;
}

// --- Modèle de langage -----------------------------------------------------

export type ExplanationRequest = {
  drug: DrugKnowledge;
  posology: string | null;
  durationDays: number | null;
  patient: PatientContext;
};

export type PatientReasonRequest = {
  productName: string;
  productClaims: string[];
  opportunityTitle: string;
  rationale: string;
};

export interface AIProvider {
  readonly info: ProviderInfo;
  /**
   * Reformule en langage clair une information provenant du référentiel.
   * Le modèle NE DOIT PAS introduire de fait médical absent de `drug` :
   * il reformule, il n'invente pas.
   */
  explainTreatment(request: ExplanationRequest): Promise<TreatmentExplanationResult>;
  /** Formule la raison affichée au patient pour un conseil déjà jugé pertinent. */
  writePatientReason(request: PatientReasonRequest): Promise<string>;
}

// --- Stockage de fichiers --------------------------------------------------

export interface StorageProvider {
  readonly info: ProviderInfo;
  put(key: string, data: Uint8Array, mimeType: string): Promise<{ key: string }>;
  getUrl(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

// --- Communications --------------------------------------------------------

export type DeliveryOutcome = {
  /** `SIMULATED` tant qu'aucun fournisseur réel n'est configuré. */
  status: "SIMULATED" | "SENT" | "FAILED";
  provider: string;
  detail: string;
};

export interface MessagingProvider {
  readonly info: ProviderInfo;
  sendDocumentLink(params: {
    to: string;
    patientName: string;
    pharmacyName: string;
    url: string;
  }): Promise<DeliveryOutcome>;
}

// --- Génération vidéo (module futur) --------------------------------------

export type VideoGenerationRequest = {
  documentId: string;
  patientFirstName: string;
  treatmentSummary: string[];
  adviceSummary: string[];
  locale: string;
};

export type VideoGenerationResult = {
  status: "NOT_CONFIGURED" | "QUEUED" | "READY" | "FAILED";
  videoUrl: string | null;
  message: string;
};

export interface VideoProvider {
  readonly info: ProviderInfo;
  generate(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
}
