/**
 * Types du domaine IA.
 *
 * Ce module est PUR : aucune dépendance à Prisma, à Next.js ou à un
 * fournisseur d'IA. C'est ce qui permet de tester le moteur métier isolément
 * et de changer de modèle sans réécrire les règles.
 */
import type { ShortDate } from "../stock/expiry";
import type { SuggestionVigilance, VigilanceLevel } from "../../config/vigilances";
import type { PopulationVigilanceRule } from "./engines/population-vigilance";
import type { EngineOutcome } from "./outcome";

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
 * différentes — ce que le médicament EST, et ce que PharmaBoost en RACONTE — et ne
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
  /**
   * D'où vient cette fiche. `AI_CLASSIFICATION` : le modèle a classé le
   * médicament (substance, ATC, classe) faute de fiche éditoriale. Elle
   * suffit à déclencher une règle de conseil ; elle ne porte ni explication
   * patient ni interaction, et le moteur de sécurité le signale.
   * `VETERINARY_NAME` : le libellé désigne un produit pour animaux (« … chien »,
   * « … chat »). Aucune règle du médicament humain ne s'y applique ; seules les
   * vigilances vétérinaires (`engines/vigilance-veterinaire.ts`) le lisent.
   */
  origin?: "EDITORIAL" | "AI_CLASSIFICATION" | "VETERINARY_NAME";
  /** Ce que le libellé dit d'un produit vétérinaire. Présent seulement pour `VETERINARY_NAME`. */
  veterinary?: VeterinaryInfo;
};

export type VeterinarySpecies = "CHIEN" | "CHAT" | "LAPIN";
export type VeterinaryForm = "SPOT_ON" | "COLLIER" | "SPRAY" | "SHAMPOOING" | "POUDRE" | "COMPRIME";

/**
 * Un produit vétérinaire tel que son libellé le désigne. Rien ici n'est déduit
 * d'une marque : seuls comptent les mots du libellé (espèce, forme, substance).
 */
export type VeterinaryInfo = {
  species: VeterinarySpecies[];
  form: VeterinaryForm | null;
  /** Substances antiparasitaires nommées dans le libellé, sans accents, en minuscules. */
  substances: string[];
  /**
   * Antiparasitaire externe À APPLICATION CUTANÉE (pipette, collier, spray,
   * shampooing, poudre) : le champ des publications de l'ANSES-ANMV sur
   * lesquelles reposent les vigilances. Un comprimé n'en fait pas partie.
   */
  cutaneous: boolean;
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

/**
 * D'où vient une référence proposable.
 *
 * Les deux origines ne se mélangent jamais en base : le catalogue de l'officine
 * porte ce que la pharmacie a créé et vend, le catalogue national porte ce que
 * l'ANSM publie. Elles se rejoignent uniquement ici, le temps d'un classement.
 */
export type CatalogProductOrigin = "PHARMACY_CATALOG" | "NATIONAL_DRUG";

export type CatalogProduct = {
  id: string;
  origin: CatalogProductOrigin;
  /** Présentation du catalogue national, si l'origine est officielle. */
  presentationId: string | null;
  /**
   * Substances actives publiées. Vide pour un produit de parapharmacie, qui
   * n'en déclare pas.
   */
  substances: string[];
  /**
   * Conditions de délivrance publiées : « liste I », « liste II »,
   * « stupéfiant »… Une liste NON VIDE signifie que le médicament est soumis à
   * prescription et ne peut donc jamais être proposé en vente additionnelle.
   */
  prescriptionConditions: string[];
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
  /**
   * Le lot non périmé le plus proche, quand l'officine suit ses dates. Ne sert
   * qu'au départage de références équivalentes — jamais au score.
   */
  shortDate?: ShortDate | null;
  /** Vigilances patient déclarées par l'officine sur ce produit. */
  vigilances?: { population: string; level: VigilanceLevel; note: string | null }[];
};

// --- Règles de l'officine --------------------------------------------------

export type PharmacyRuleInput = {
  id: string;
  type: "PREFER_PRODUCT" | "EXCLUDE_PRODUCT" | "PREFER_CATEGORY" | "EXCLUDE_CATEGORY" | "PREFER_BRAND" | "EXCLUDE_BRAND";
  productId: string | null;
  category: ProductCategoryCode | null;
  /** Laboratoire ou marque visé, pour PREFER_BRAND / EXCLUDE_BRAND. */
  brand?: string | null;
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
  /** Contenu structuré d'une vigilance, quand le signal en est une. */
  details?: VigilanceDetails | null;
};

// --- Vigilances -------------------------------------------------------------

export type VigilanceKind = "INTERACTION" | "CONTRAINDICATION" | "MONITORING" | "SCREENING" | "USAGE" | "AVOID";

/** Ce que la carte du comptoir affiche pour une vigilance. */
export type VigilanceDetails = {
  key: string;
  version: string;
  kind: VigilanceKind;
  title: string;
  subtitle: string;
  /** Les médicaments de l'ordonnance qui l'ont déclenchée, tels que prescrits. */
  drugNames: string[];
  explanation: string;
  concerned: string[];
  patientAdvice: string | null;
  sources: string[];
};

export type VigilanceResult = VigilanceDetails & {
  severity: "WARNING" | "INFO";
  blockTags: string[];
  cautionTags: string[];
  precautionText: string | null;
};

/** L'étape d'une routine à laquelle appartient une proposition. */
export type RoutineStepInfo = {
  key: string;
  title: string;
  stepKey: string;
  stepLabel: string;
  stepIndex: number;
  stepCount: number;
  benefit: string;
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
  /** La même raison en une ligne, `{drug}` déjà substitué. */
  shortReason: string;
  /**
   * La phrase à dire au patient, `{drug}` déjà substitué. `{product}` ne l'est
   * qu'au scoring : à ce stade le catalogue n'a pas été consulté.
   */
  counterScriptTemplate: string;
  /** Le pourquoi lu par le patient, `{drug}` substitué, `{product}` non. */
  patientReasonTemplate: string;
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
  /** Motifs de nom qui écartent une référence pour cette règle (sauf motif préféré). */
  productExclude?: string[];
  /** Motifs de nom qui font préférer une référence (« sans alcool »). */
  productPrefer?: string[];
  /** Le produit à associer à la référence retenue, quand la règle en prévoit un. */
  companion?: { when: string; productPatterns: string[]; productExclude?: string[]; label: string; reason: string } | null;
  /** Ce que le conseil apporte dans ce contexte, trois mots-clés écrits dans la règle. */
  benefits?: string[];
  /** L'étape de routine que cette opportunité représente, quand la règle en décrit une. */
  routine?: RoutineStepInfo | null;
  /** Vigilances par population écrites dans la règle (sourcées, jamais déduites). */
  populations?: PopulationVigilanceRule[];
  triggeredBy: { lineIndex: number; drugName: string }[];
  /**
   * Le stock de l'officine a-t-il pu répondre à ce besoin ? Renseigné pour les
   * besoins non bloqués seulement (un besoin écarté par la sécurité n'est pas un
   * manque d'assortiment).
   */
  coverage?: OpportunityCoverage | null;
  /**
   * La question à poser au patient avant de proposer quoi que ce soit, écrite
   * dans la règle — jamais formulée à la volée. `null` quand le conseil se
   * justifie par le traitement seul.
   */
  question?: string | null;
  /** Vrai quand la proposition attend la réponse du patient à `question`. */
  requiresConfirmation?: boolean;
  /** Le besoin identifié par la compréhension IA, s'il a déclenché la règle. */
  needKey?: string | null;
  /** Pourquoi le modèle a vu ce besoin ici — pour le pharmacien, jamais le patient. */
  aiJustification?: string | null;
  /** La règle qui a parlé, et sa version. */
  ruleKey?: string;
  ruleVersion?: string;
  /** Le pourquoi une fois le besoin confirmé par le patient. */
  confirmedReason?: string | null;
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
  /**
   * La raison en une ligne, lisible au comptoir sans s'arrêter de parler.
   * Format tenu : « pourquoi », pas « quoi ». La version longue reste dans
   * `justification` pour la relecture a posteriori.
   */
  shortReason: string;
  /** Formulation écrite sur la fiche remise au patient. */
  patientReason: string;
  /** La phrase à dire au comptoir, issue de la règle de conseil. */
  counterScript: string;
  precautions: string[];
  /** Contributions ordonnées, pour l'affichage « Pourquoi ce produit ? ». */
  explanation: ScoreContribution[];
  /** Le produit à associer, trouvé dans le stock, s'il y en a un. */
  companion?: CompanionSuggestion | null;
  /** L'étape de routine, quand la proposition en fait partie. */
  routine?: RoutineStepInfo | null;
  /** Vigilances patient à afficher sur la carte (jamais dans le document patient). */
  vigilances?: SuggestionVigilance[];
  /** Date courte de la référence retenue, s'il y en a une (information, jamais un argument). */
  shortDate?: ShortDate | null;
  /** Ce qui a départagé des références cliniquement équivalentes (trace). */
  tiebreak?: string | null;
  /**
   * Les autres références du stock adaptées au MÊME besoin. Elles suivent le
   * choix du conseil sans jamais l'influencer : calculées une fois le conseil
   * retenu, parmi des candidates déjà passées par la sécurité, les seuils et le
   * stock.
   */
  alternatives?: ScoredAlternative[];
};

/**
 * Une autre référence adaptée au besoin d'un conseil retenu, avec tout ce qu'il
 * faut pour la mettre à sa place comme si le moteur l'avait choisie : son score,
 * les textes écrits pour elle, ses précautions, ses vigilances, son produit
 * associé. Rien de plus que pour le conseil principal — une alternative ne
 * change ni le besoin ni la routine.
 */
export type ScoredAlternative = Pick<
  ScoredRecommendation,
  | "productId"
  | "totalScore"
  | "breakdown"
  | "justification"
  | "shortReason"
  | "patientReason"
  | "counterScript"
  | "precautions"
  | "explanation"
  | "companion"
  | "vigilances"
  | "shortDate"
>;

/** Un produit à proposer À CÔTÉ d'une recommandation (seringue avec un flacon de sérum). */
export type CompanionSuggestion = {
  productId: string;
  name: string;
  salePriceCents: number;
  stockQuantity: number;
  label: string;
  reason: string;
};

/**
 * Les dimensions qui pèsent réellement dans le score.
 *
 * `availability` en est volontairement absente : le stock ne rend pas un
 * produit plus pertinent cliniquement. Il sert à écarter ce qui n'est pas
 * délivrable et à départager des références déjà jugées équivalentes — jamais
 * à faire remonter un produit moins adapté.
 */
export type ScoredDimension = Exclude<keyof ScoreBreakdown, "availability">;

export type ScoreContribution = {
  dimension: keyof ScoreBreakdown;
  label: string;
  value: number;
  weight: number;
  detail: string;
  /**
   * `SCORE` : la dimension entre dans le total pondéré.
   * `FILTRE` : elle écarte ou départage, sans jamais augmenter le total.
   */
  role: "SCORE" | "FILTRE";
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
  /** Pourquoi il y a — ou non — des propositions (src/core/ai/outcome.ts). */
  outcome: EngineOutcome;
  safetyFindings: SafetyFindingResult[];
  explanations: TreatmentExplanationResult[];
  opportunities: AdviceOpportunityResult[];
  recommendations: ScoredRecommendation[];
  trace: PipelineStageTrace[];
  blockedReasons: string[];
  /** `true` si un fournisseur simulé est intervenu dans la chaîne. */
  usedSimulatedProviders: boolean;
  /** Les vigilances que le traitement impose (interactions, contre-indications, surveillance, dépistage). */
  vigilances?: VigilanceResult[];
};

/**
 * Ce que le stock a répondu à un besoin de conseil :
 *  - COVERED : une référence convient (retenue, ou écartée seulement par la limite d'affichage) ;
 *  - NO_SUITABLE : des références existent mais aucune ne convient au besoin ;
 *  - OUT_OF_STOCK : des références correspondent mais sont en rupture ;
 *  - NOT_REFERENCED : aucune référence de l'officine ne correspond.
 */
export type OpportunityCoverage = "COVERED" | "NO_SUITABLE" | "OUT_OF_STOCK" | "NOT_REFERENCED";
