/**
 * Types du domaine IA.
 *
 * Ce module est PUR : aucune dépendance à Prisma, à Next.js ou à un
 * fournisseur d'IA. C'est ce qui permet de tester le moteur métier isolément
 * et de changer de modèle sans réécrire les règles.
 */

export type ProductCategoryCode =
  | "PROBIOTIQUES"
  | "VITAMINES"
  | "MINERAUX"
  | "MAGNESIUM"
  | "HYGIENE"
  | "DERMATOLOGIE"
  | "DERMOCOSMETIQUE"
  | "SOINS"
  | "NUTRITION"
  | "DISPOSITIFS_MEDICAUX"
  | "PHYTOTHERAPIE"
  | "SAISONNIER"
  | "AUTRE";

export type SafetySeverityCode = "INFO" | "CAUTION" | "WARNING" | "BLOCKING";

// --- Extraction (étape A) --------------------------------------------------

export type ExtractedField<T> = {
  value: T | null;
  /** 0 → 1. En dessous du seuil, une vérification humaine est imposée. */
  confidence: number;
  /** `true` lorsque la zone était illisible : la valeur reste `null`. */
  unreadable: boolean;
};

export type ExtractedPrescriptionLine = {
  position: number;
  rawText: string | null;
  drugName: ExtractedField<string>;
  dosage: ExtractedField<string>;
  form: ExtractedField<string>;
  posology: ExtractedField<string>;
  durationDays: ExtractedField<number>;
  quantity: ExtractedField<number>;
  instructions: ExtractedField<string>;
};

export type ExtractedPrescription = {
  prescriberName: ExtractedField<string>;
  prescriberRpps: ExtractedField<string>;
  prescribedAt: ExtractedField<string>;
  patientName: ExtractedField<string>;
  lines: ExtractedPrescriptionLine[];
  /** Confiance globale, moyenne pondérée des champs. */
  overallConfidence: number;
  providerId: string;
  /** Signale explicitement une extraction simulée (mode démonstration). */
  isSimulated: boolean;
  warnings: string[];
};

// --- Référentiel médicamenteux --------------------------------------------

/**
 * Ce que la source officielle publie d'un médicament.
 *
 * Rien n'est rédigé ici : uniquement des faits, avec leur source et leur date.
 * Ce bloc et la couche éditoriale de `DrugKnowledge` répondent à deux questions
 * différentes — ce que le médicament EST, et ce que Pharma.ai en RACONTE — et ne
 * doivent jamais être présentés comme une seule et même information.
 */
export type OfficialDrugFacts = {
  /** Code Identifiant de Spécialité du catalogue national. */
  cisCode: string;
  /** Dénomination officielle, telle que publiée. */
  name: string;
  pharmaceuticalForm: string | null;
  administrationRoutes: string[];
  /** Substances actives telles que publiées. */
  substances: string[];
  /** « liste I », « stupéfiant »… tels que publiés. */
  prescriptionConditions: string[];
  marketed: boolean;
  /** Nom de la source, à afficher partout où ces faits apparaissent. */
  sourceName: string;
  /** Date de mise à jour publiée par la source, jamais celle de notre import. */
  sourceUpdatedAt: string | null;
};

export type DrugKnowledge = {
  id: string;
  name: string;
  inn: string | null;
  atcCode: string | null;
  therapeuticClass: string | null;
  form: string | null;
  commonSideEffects: string[];
  interactionClasses: string[];
  cautionPopulations: string[];
  patientExplanation: string | null;
  intakeAdvice: string | null;
  sourceName: string;
  sourceVersion: string;
  /** `true` tant que la donnée provient du jeu fictif de démonstration. */
  isDemoData: boolean;
};

// --- Contexte patient ------------------------------------------------------

export type PatientContext = {
  patientId: string | null;
  ageYears: number | null;
  sex: "FEMALE" | "MALE" | "UNSPECIFIED";
  isPregnant: boolean | null;
  isBreastfeeding: boolean | null;
  renalImpairment: boolean | null;
  hepaticImpairment: boolean | null;
  allergies: string[];
  chronicConditions: string[];
  currentTreatments: string[];
  /** Consentement au partage de la fiche conseil. */
  hasAdviceConsent: boolean;
};

// --- Catalogue -------------------------------------------------------------

export type CatalogProduct = {
  id: string;
  name: string;
  brand: string | null;
  category: ProductCategoryCode;
  subCategory: string | null;
  reference: string;
  ean: string | null;
  imageUrl: string | null;
  description: string | null;
  commercialClaims: string[];
  precautions: string[];
  matchingTags: string[];
  contraindications: string[];
  salePriceCents: number;
  purchasePriceCents: number;
  vatRate: number;
  /** Stock de l'officine courante. */
  stockQuantity: number;
  alertThreshold: number;
  /** Disponibilité dans une autre officine du groupe, si l'option est active. */
  availableInSiblingPharmacy: boolean;
  isActive: boolean;
};

// --- Règles de l'officine --------------------------------------------------

export type PharmacyRuleInput = {
  id: string;
  type: "PREFER_PRODUCT" | "EXCLUDE_PRODUCT" | "PREFER_CATEGORY" | "EXCLUDE_CATEGORY";
  productId: string | null;
  category: ProductCategoryCode | null;
  /** Restreint la règle à certains contextes thérapeutiques. */
  context: { atcPrefixes?: string[]; therapeuticClasses?: string[] };
  weight: number;
};

/** Statistiques d'acceptation propres à l'officine, par produit. */
export type ProductValidationHistory = Record<
  string,
  { proposed: number; accepted: number; purchased: number }
>;

// --- Sécurité (étape B) ----------------------------------------------------

export type SafetyFindingResult = {
  severity: SafetySeverityCode;
  code: string;
  message: string;
  subjectType: "PRESCRIPTION_LINE" | "OPPORTUNITY" | "PRODUCT" | "PATIENT" | "ANALYSIS";
  subjectId: string | null;
  source: string;
};

// --- Explication du traitement (étape C) ----------------------------------

export type TreatmentExplanationResult = {
  lineIndex: number;
  purpose: string | null;
  instructions: string | null;
  tips: string[];
  precautions: string[];
  source: "REFERENTIAL" | "PROFESSIONAL" | "DEMO" | "UNAVAILABLE";
  sourceRefs: string[];
  confidence: number;
  requiresReview: boolean;
};

// --- Opportunités de conseil (étape D) ------------------------------------

export type AdviceKind = "SAFETY" | "TOLERANCE" | "COMFORT";

export type AdviceOpportunityResult = {
  key: string;
  /** Nature du conseil : un conseil de sécurité prime sur un conseil de confort. */
  kind: AdviceKind;
  category: ProductCategoryCode;
  title: string;
  rationale: string;
  /**
   * La phrase à dire au patient, `{drug}` déjà substitué. `{product}` ne l'est
   * qu'au scoring : à ce stade le catalogue n'a pas été consulté.
   */
  counterScriptTemplate: string;
  clinicalContext: string | null;
  safetyNotes: string[];
  /** 0 → 100. Priorité clinique, strictement indépendante de toute marge. */
  priority: number;
  isBlocked: boolean;
  blockReason: string | null;
  /** Étiquettes servant à l'appariement catalogue (étape E). */
  matchingTags: string[];
  /** Contre-indications à écarter lors de l'appariement. */
  excludeTags: string[];
  triggeredBy: { lineIndex: number; drugName: string }[];
};

// --- Score (étape F) -------------------------------------------------------

export type ScoreBreakdown = {
  /** Adéquation entre le produit et l'opportunité de conseil. */
  relevance: number;
  /** 1 = aucun signal de sécurité ; 0 = produit écarté. */
  safety: number;
  /** Disponibilité réelle en stock. */
  availability: number;
  /** Adéquation au patient (âge, grossesse, allergies…). */
  patientFit: number;
  /** Préférences déclarées par l'officine. */
  pharmacistPreference: number;
  /** Historique d'acceptation dans cette officine. */
  validationHistory: number;
  /** Ajustement commercial autorisé — appliqué en dernier, jamais dominant. */
  commercial: number;
};

export type ScoredRecommendation = {
  opportunityKey: string;
  productId: string;
  totalScore: number;
  breakdown: ScoreBreakdown;
  /** Explication technique destinée au pharmacien. */
  justification: string;
  /** Formulation écrite sur la fiche remise au patient. */
  patientReason: string;
  /** La phrase à dire au comptoir, issue de la règle de conseil. */
  counterScript: string;
  precautions: string[];
  /** Contributions ordonnées, pour l'affichage « Pourquoi ce produit ? ». */
  explanation: ScoreContribution[];
};

export type ScoreContribution = {
  dimension: keyof ScoreBreakdown;
  label: string;
  value: number;
  weight: number;
  detail: string;
};

// --- Trace du pipeline -----------------------------------------------------

export type PipelineStageName =
  | "EXTRACTION"
  | "VERIFICATION"
  | "SAFETY"
  | "TREATMENT_UNDERSTANDING"
  | "ADVICE_OPPORTUNITIES"
  | "CATALOG_MATCHING"
  | "SCORING"
  | "COMMERCIAL_OPTIMIZATION";

export type PipelineStageTrace = {
  stage: PipelineStageName;
  label: string;
  status: "OK" | "PARTIAL" | "BLOCKED" | "SKIPPED";
  durationMs: number;
  inputCount: number;
  outputCount: number;
  notes: string[];
};

export type AnalysisResult = {
  engineVersion: string;
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  safetyFindings: SafetyFindingResult[];
  explanations: TreatmentExplanationResult[];
  opportunities: AdviceOpportunityResult[];
  recommendations: ScoredRecommendation[];
  trace: PipelineStageTrace[];
  blockedReasons: string[];
  /** `true` si un fournisseur simulé est intervenu dans la chaîne. */
  usedSimulatedProviders: boolean;
};
