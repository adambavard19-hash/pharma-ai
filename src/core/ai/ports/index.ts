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

/**
 * Un message prêt à partir.
 *
 * Sujet et corps sont produits par un gabarit figé côté domaine
 * (`src/core/documents/email.ts`, `src/core/followup/templates.ts`). Le
 * fournisseur ne compose rien, il transporte — c'est ce qui garantit que le
 * texte reçu par le patient ne dépend pas du prestataire branché ce jour-là.
 */
export type OutgoingEmail = {
  to: string;
  subject: string;
  /** Version texte : celle qui fait foi. */
  text: string;
  /** Version HTML facultative, strictement équivalente au texte. */
  html?: string;
};

export interface MessagingProvider {
  readonly info: ProviderInfo;
  /**
   * Transmet un message déjà rédigé.
   *
   * Ne lève jamais : une panne du prestataire ne doit pas interrompre le
   * comptoir. Un échec revient en `FAILED` avec le motif réel, jamais masqué
   * derrière un succès.
   */
  sendEmail(message: OutgoingEmail): Promise<DeliveryOutcome>;
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
