import type {
  AdviceOpportunityResult,
  DrugKnowledge,
  PatientContext,
  ProductCategoryCode,
} from "../types";
import type { IdentifiedNeed, NeedKey } from "../../understanding";

/**
 * Moteur d'opportunités de conseil (étape D).
 *
 * Point essentiel : on ne fait PAS « antibiotique ⇒ probiotique ». On évalue un
 * faisceau de conditions, on pondère, et on expose systématiquement la raison.
 * Chaque règle déclare :
 *   • ce qui la déclenche (classe ATC / classe thérapeutique / effet fréquent) ;
 *   • ce qui la renforce ou l'affaiblit selon le contexte patient ;
 *   • ce qui la BLOQUE ;
 *   • la formulation destinée au pharmacien.
 *
 * Une opportunité n'est jamais un produit : c'est un besoin de conseil. Le
 * rapprochement avec le catalogue n'intervient qu'à l'étape suivante.
 */

/**
 * Nature du conseil.
 *
 * `SAFETY` désigne un conseil dont l'absence expose le patient à un risque
 * (photosensibilisation, par exemple) : il ne peut jamais être classé derrière
 * un conseil de confort. Cette garantie est appliquée par `PRIORITY_FLOOR`
 * plus bas et vérifiée par un test.
 */
export type AdviceKind = "SAFETY" | "TOLERANCE" | "COMFORT";

/** Priorité minimale garantie selon la nature du conseil. */
export const PRIORITY_FLOOR: Record<AdviceKind, number> = {
  SAFETY: 80,
  TOLERANCE: 0,
  COMFORT: 0,
};

/** Priorité maximale autorisée selon la nature du conseil. */
export const PRIORITY_CEILING: Record<AdviceKind, number> = {
  SAFETY: 100,
  TOLERANCE: 79,
  COMFORT: 79,
};

/**
 * Ce qui autorise une règle à se déclencher.
 *
 * `CLASS_ONLY` : la règle affirme quelque chose sur la CLASSE du médicament
 * (« ce traitement est un anti-inflammatoire »). Elle ne peut donc se
 * déclencher que sur une correspondance de classe ATC ou thérapeutique — un
 * effet indésirable partagé, comme « troubles digestifs », ne suffit pas et
 * produirait une affirmation fausse.
 *
 * `CLASS_OR_SIDE_EFFECT` : la règle porte sur l'EFFET lui-même (sécheresse
 * buccale, photosensibilisation). Un effet indésirable documenté est alors un
 * déclencheur légitime, quelle que soit la classe.
 */
export type AdviceTriggerMode = "CLASS_ONLY" | "CLASS_OR_SIDE_EFFECT";

/**
 * Où en est la validation professionnelle d'une règle.
 *
 * `PENDING` : écrite et testée, pas encore relue par un pharmacien. Elle peut
 * parler au comptoir — avec des « peut », jamais des « doit » — mais
 * l'administration la montre comme telle. `VALIDATED` : relue, datée, signée.
 */
export type RuleValidation =
  | { status: "PENDING" }
  | { status: "VALIDATED"; validatedAt: string; validatedBy: string };

export type AdviceRule = {
  key: string;
  title: string;
  kind: AdviceKind;
  /** Version de la règle. Toute modification de fond l'incrémente. */
  version: string;
  validation: RuleValidation;
  triggerMode: AdviceTriggerMode;
  category: ProductCategoryCode;
  /** Préfixes de code ATC déclenchant la règle. */
  atcPrefixes: string[];
  /** Classes thérapeutiques (libellés du référentiel) déclenchant la règle. */
  therapeuticClasses: string[];
  /** Effets indésirables fréquents qui rendent le conseil pertinent. */
  sideEffectTriggers: string[];
  /**
   * Besoins de la compréhension IA (`src/core/understanding/needs.ts`) qui
   * déclenchent la règle. Le modèle identifie le besoin ; la règle, elle,
   * décide de ce qui en découle. Une règle sans `needTriggers` ne peut être
   * déclenchée que par la couche éditoriale.
   */
  needTriggers?: NeedKey[];
  /**
   * La question à poser au patient AVANT de proposer quoi que ce soit.
   *
   * Écrite ici, relue, versionnée : jamais formulée par le modèle. Dès qu'une
   * règle en porte une, la proposition attend la réponse — quel que soit ce
   * qui a déclenché la règle. Un conseil de confort ne se justifie que si le
   * patient ressent la gêne ; l'ordonnance seule ne le dit pas.
   */
  question?: string;
  /**
   * Le « pourquoi » une fois que le patient a répondu oui : la gêne n'est
   * plus plausible, elle est confirmée. Une phrase, pour le pharmacien.
   */
  confirmedReasonTemplate?: string;
  /** Priorité clinique de base, 0 → 100. Indépendante de toute marge. */
  basePriority: number;
  matchingTags: string[];
  excludeTags: string[];
  /**
   * Motifs (sur le nom du produit, sans accents, en minuscules) qui ÉCARTENT
   * une référence pour cette règle, sauf si un motif de `productPrefer` la
   * sauve. Un bain de bouche alcoolisé après un corticoïde inhalé, par exemple.
   */
  productExclude?: string[];
  /** Motifs qui font préférer une référence à ses équivalentes (« sans alcool »). */
  productPrefer?: string[];
  /**
   * Le produit à associer à la proposition, quand la référence retenue en
   * appelle un : `when` reconnaît la référence (un flacon, pas un spray), les
   * `productPatterns` reconnaissent le produit associé dans le stock.
   */
  companion?: { when: string; productPatterns: string[]; productExclude?: string[]; label: string; reason: string };
  /**
   * Ce que le conseil apporte dans ce contexte : trois mots-clés au plus,
   * écrits ici et relus — jamais tirés de l'argumentaire d'un produit. Ils se
   * lisent sur la carte du comptoir, sous la référence proposée.
   */
  benefits?: string[];
  /**
   * Une routine : plusieurs étapes, chacune appariée à une référence du stock,
   * proposées ensemble et si possible dans la même gamme. Chaque étape a ses
   * propres étiquettes d'appariement ; la règle porte le pourquoi commun.
   */
  routine?: {
    title: string;
    steps: { key: string; label: string; matchingTags: string[]; productExclude?: string[]; productPrefer?: string[]; benefit: string }[];
  };
  /** Explication en langage pharmacien. `{drug}` est remplacé. */
  rationaleTemplate: string;
  /**
   * La même raison en une ligne, lisible sans s'arrêter de parler au patient.
   *
   * Contrainte tenue : elle dit POURQUOI ce conseil surgit pour CE traitement,
   * jamais ce que fait le produit — sans quoi ce serait un argumentaire. Un
   * test vérifie qu'elle reste courte et qu'elle nomme le médicament
   * déclencheur.
   */
  shortReasonTemplate: string;
  /**
   * La phrase à dire au patient, au comptoir. `{drug}` et `{product}` sont
   * remplacés — le reste est écrit ici, relu, versionné.
   *
   * Elle n'est JAMAIS rédigée à la volée : c'est ce qui garantit qu'aucune
   * justification médicale ne peut être inventée pour vendre davantage. Elle
   * énonce un fait lié au traitement, propose, et ne promet rien. Une règle
   * qui peut se déclencher sur un simple effet indésirable
   * (`CLASS_OR_SIDE_EFFECT`) ne doit pas affirmer ce QU'EST le médicament ;
   * un test le vérifie.
   *
   * `{drug}` est substitué à l'étape des opportunités, `{product}` seulement au
   * scoring : l'étape qui juge de la pertinence ne voit toujours pas le
   * catalogue.
   */
  counterScriptTemplate: string;
  /**
   * Le POURQUOI destiné au patient, écrit dans ses mots.
   *
   * Distinct des trois autres : `rationaleTemplate` parle au pharmacien,
   * `shortReasonTemplate` résume le déclencheur clinique, `counterScriptTemplate`
   * est ce qu'on prononce. Celui-ci est ce que le patient LIT — sur la carte du
   * comptoir et sur son plan de traitement. Il énonce le lien entre son
   * traitement et le conseil, sans jargon et sans promesse.
   *
   * Il est écrit ici, relu et versionné — jamais dérivé de l'argumentaire
   * commercial du produit : une raison médicale ne se fabrique pas à partir
   * d'une accroche marketing.
   */
  patientReasonTemplate: string;
  clinicalContext: string;
  safetyNotes: string[];
  /** Renvoie une raison de blocage, ou `null` si la règle reste applicable. */
  blockedFor?: (patient: PatientContext) => string | null;
  /** Ajustement de priorité selon le contexte patient (−30 → +30). */
  adjustPriority?: (patient: PatientContext) => number;
};

/**
 * Base de règles de conseil.
 *
 * ⚠️ Ce jeu de règles est un socle de démonstration structuré pour le MVP. Il
 * doit être revu et validé par un pharmacien avant toute utilisation réelle,
 * et idéalement adossé à des recommandations professionnelles référencées.
 * Voir docs/CONFORMITE.md.
 */
export const ADVICE_RULES: AdviceRule[] = [
  {
    key: "digestive-tolerance-antibiotics",
    benefits: ["Accompagne la flore pendant la cure", "À distance de l'antibiotique", "Cure de la durée du traitement"],
    title: "Tolérance digestive pendant l'antibiothérapie",
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["ANTIBIOTIC_DIGESTIVE_TOLERANCE"],
    category: "PROBIOTIQUES",
    atcPrefixes: ["J01"],
    therapeuticClasses: ["Antibiotique", "Antibactérien"],
    sideEffectTriggers: ["diarrhée", "troubles digestifs"],
    basePriority: 72,
    matchingTags: ["probiotique", "flore intestinale", "tolérance digestive"],
    excludeTags: ["immunodépression"],
    shortReasonTemplate:
      "Antibiothérapie ({drug}) : la flore intestinale peut être perturbée pendant la cure.",
    rationaleTemplate:
      "Une antibiothérapie ({drug}) peut perturber la flore intestinale. Un accompagnement de la tolérance digestive peut être pertinent selon le patient et la durée du traitement.",
    counterScriptTemplate:
      "« {drug} est un antibiotique : il peut perturber la flore intestinale. {product} l'accompagne, à prendre à distance de l'antibiotique. »",
    patientReasonTemplate:
      "Votre antibiotique ({drug}) peut déséquilibrer la flore de votre intestin pendant la cure. {product} l'accompagne, à prendre à distance de l'antibiotique.",
    clinicalContext:
      "À apprécier au cas par cas : durée du traitement, antécédents digestifs, âge, état immunitaire.",
    // « Prise à distance de l'antibiotique » a quitté cette liste : la phrase de
    // comptoir le dit désormais au patient. Le répéter ici l'afficherait trois
    // fois sur la même carte — la précaution produit le mentionne aussi — et au
    // comptoir une information répétée est une information survolée.
    safetyNotes: ["Déconseillé en cas d'immunodépression sévère."],
    blockedFor: (patient) =>
      patient.chronicConditions.some((c) =>
        /immunod|leucémie|greffe|vih/i.test(c),
      )
        ? "Contexte d'immunodépression déclaré : ce conseil relève d'un avis médical."
        : null,
    adjustPriority: (patient) => (patient.ageYears !== null && patient.ageYears > 70 ? 8 : 0),
  },
  {
    key: "gastric-protection-nsaid",
    title: "Confort gastrique sous anti-inflammatoire",
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["GASTRIC_DISCOMFORT"],
    question: "Le patient ressent-il des brûlures ou une gêne à l'estomac ?",
    category: "SOINS",
    atcPrefixes: ["M01A"],
    therapeuticClasses: ["Anti-inflammatoire non stéroïdien", "AINS"],
    sideEffectTriggers: ["gastralgie", "troubles gastriques"],
    basePriority: 64,
    matchingTags: ["confort gastrique", "estomac", "digestion"],
    excludeTags: [],
    shortReasonTemplate:
      "Anti-inflammatoire ({drug}) : l'inconfort gastrique fait souvent arrêter le traitement.",
    rationaleTemplate:
      "{drug} est un anti-inflammatoire ; l'inconfort gastrique est un motif fréquent d'arrêt du traitement. Un rappel des règles de prise, éventuellement accompagné d'un conseil, peut améliorer l'observance.",
    counterScriptTemplate:
      "« {drug} est un anti-inflammatoire : prenez-le au milieu d'un repas, jamais à jeun. En cas de gêne, {product} peut aider au confort, sans remplacer un protecteur prescrit. »",
    confirmedReasonTemplate: "Gêne gastrique confirmée sous anti-inflammatoire.",
    patientReasonTemplate:
      "{drug} est un anti-inflammatoire : il peut irriter l'estomac, surtout à jeun. {product} aide au confort digestif pendant le traitement.",
    clinicalContext:
      "Vérifier l'existence d'une protection gastrique déjà prescrite avant tout conseil complémentaire.",
    safetyNotes: [
      "Ne se substitue jamais à une protection gastrique prescrite.",
      "Antécédent d'ulcère : orienter vers le médecin.",
    ],
    adjustPriority: (patient) => (patient.ageYears !== null && patient.ageYears > 65 ? 10 : 0),
  },
  {
    key: "hydration-dermato-topical",
    benefits: ["Peau moins sèche, moins irritée", "Application quotidienne", "Sans parfum à privilégier"],
    title: "Accompagnement cutané d'un traitement dermatologique",
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["SKIN_DRYNESS"],
    category: "DERMOCOSMETIQUE",
    atcPrefixes: ["D07", "D05", "D10"],
    therapeuticClasses: ["Dermocorticoïde", "Traitement dermatologique"],
    sideEffectTriggers: ["sécheresse cutanée", "irritation"],
    basePriority: 68,
    matchingTags: ["hydratation", "peau sensible", "émollient", "apaisant"],
    excludeTags: ["parfum"],
    shortReasonTemplate:
      "Traitement dermatologique local ({drug}) : sécheresse cutanée fréquente.",
    rationaleTemplate:
      "Un traitement dermatologique local ({drug}) s'accompagne souvent d'une sécheresse ou d'une sensibilité cutanée. Un soin émollient adapté peut soutenir la tolérance du traitement.",
    counterScriptTemplate:
      "« Ce traitement local ({drug}) assèche souvent la peau. {product} s'applique sur peau propre, à distance du traitement actif, pour limiter l'inconfort. »",
    patientReasonTemplate:
      "Votre traitement pour la peau ({drug}) assèche souvent la zone traitée. {product} l'hydrate et limite les tiraillements.",
    clinicalContext:
      "Privilégier une formule sans parfum sur peau lésée. Application à distance du traitement actif.",
    safetyNotes: ["Ne pas appliquer sur une plaie ouverte sans avis."],
  },
  {
    key: "magnesium-fatigue",
    benefits: ["Compense une absorption réduite", "Contribue à réduire la fatigue", "Forme bien tolérée à privilégier"],
    title: "Fatigue et tension musculaire",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_OR_SIDE_EFFECT",
    needTriggers: ["FATIGUE_CRAMPS"],
    question: "Le patient se plaint-il de fatigue ou de crampes ?",
    category: "MAGNESIUM",
    atcPrefixes: ["N05B", "N06A"],
    therapeuticClasses: ["Anxiolytique", "Antidépresseur"],
    sideEffectTriggers: ["fatigue", "crampes", "asthénie"],
    basePriority: 48,
    matchingTags: ["magnésium", "fatigue", "crampes", "vitamine b6"],
    excludeTags: [],
    shortReasonTemplate:
      "Fatigue fréquemment rapportée dans le contexte de {drug}.",
    rationaleTemplate:
      "Le contexte du traitement ({drug}) s'accompagne fréquemment d'une fatigue rapportée au comptoir. Un apport en magnésium peut être discuté si l'alimentation est insuffisante.",
    counterScriptTemplate:
      "« Vous ressentez de la fatigue ou des crampes ? {product} apporte du magnésium ; sinon ce n'est pas utile. »",
    confirmedReasonTemplate: "Fatigue ou crampes confirmées dans ce contexte.",
    patientReasonTemplate:
      "Une fatigue ou des crampes sont fréquentes dans ce contexte. {product} apporte du magnésium — utile seulement si vous ressentez ces signes.",
    clinicalContext:
      "Conseil pertinent uniquement si le patient exprime une fatigue ou des crampes. À ne pas proposer systématiquement.",
    safetyNotes: [
      "Contre-indiqué en cas d'insuffisance rénale.",
      "Vérifier l'absence de supplémentation déjà en cours.",
    ],
    blockedFor: (patient) =>
      patient.renalImpairment
        ? "Insuffisance rénale déclarée : un apport en magnésium relève d'un avis médical."
        : null,
  },
  {
    key: "magnesium-ppi-longterm",
    title: "Magnésium sous IPP au long cours",
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "MAGNESIUM",
    atcPrefixes: ["A02BC"],
    therapeuticClasses: ["Inhibiteur de la pompe à protons"],
    sideEffectTriggers: [],
    // L'hypomagnésémie sous IPP est un effet du long cours : la question
    // écarte la cure courte, où le conseil n'aurait pas de sens.
    question: "Le traitement par IPP dure-t-il depuis plus de trois mois, ou le patient a-t-il des crampes ou une fatigue inhabituelle ?",
    confirmedReasonTemplate: "IPP au long cours ({drug}) : l'absorption du magnésium peut être diminuée, et le patient le ressent.",
    basePriority: 64,
    matchingTags: ["magnésium", "fatigue", "crampes"],
    excludeTags: [],
    benefits: ["Compense une absorption réduite", "Contribue à réduire la fatigue", "Forme bien tolérée à privilégier"],
    shortReasonTemplate:
      "IPP ({drug}) : au long cours, l'absorption intestinale du magnésium peut diminuer.",
    rationaleTemplate:
      "Les inhibiteurs de la pompe à protons ({drug}) peuvent entraîner une diminution de l'absorption intestinale du magnésium, surtout au-delà de trois mois de traitement. Une supplémentation peut être proposée, en particulier en cas de crampes ou de fatigue.",
    counterScriptTemplate:
      "« {drug} pris longtemps peut faire baisser le magnésium. {product} compense cet apport ; à prendre à distance des autres médicaments. »",
    patientReasonTemplate:
      "Votre traitement ({drug}), pris sur la durée, peut réduire l'absorption du magnésium. {product} compense cet apport.",
    clinicalContext:
      "Hypomagnésémie décrite sous IPP prolongé (ANSM, 2011). Un dosage se discute en cas de symptômes persistants ou de traitement associé (diurétique, digoxine).",
    safetyNotes: ["En cas d'insuffisance rénale, l'apport en magnésium relève d'un avis médical."],
    blockedFor: (patient) =>
      patient.renalImpairment ? "Insuffisance rénale déclarée : l'apport en magnésium relève d'un avis médical." : null,
  },
  {
    key: "vitamin-d-elderly",
    title: "Statut vitaminique D",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "VITAMINES",
    // H02 : corticoïdes SYSTÉMIQUES. Un corticoïde inhalé (R03BA) n'expose
    // pas l'os de la même façon et ne doit pas déclencher ce conseil.
    atcPrefixes: ["M05B", "H05", "H02"],
    therapeuticClasses: [
      "Traitement de l'ostéoporose",
      "Corticoïde par voie orale",
      "Corticoïde systémique",
      "Corticothérapie au long cours",
    ],
    sideEffectTriggers: [],
    basePriority: 55,
    matchingTags: ["vitamine d", "os", "calcium"],
    excludeTags: [],
    shortReasonTemplate:
      "Contexte osseux ({drug}) : le statut en vitamine D mérite d'être évoqué.",
    rationaleTemplate:
      "Le traitement ({drug}) s'inscrit dans un contexte osseux. Le statut en vitamine D mérite d'être évoqué avec le patient.",
    counterScriptTemplate:
      "« Votre traitement ({drug}) concerne la santé osseuse. Votre vitamine D a-t-elle été contrôlée récemment ? Si aucune supplémentation n'est déjà prescrite, {product} est à évoquer avec votre médecin. »",
    patientReasonTemplate:
      "Votre traitement concerne la santé de vos os. {product} apporte de la vitamine D, à évoquer avec votre médecin si vous n'en prenez pas déjà.",
    clinicalContext:
      "Vérifier qu'une supplémentation n'est pas déjà prescrite avant tout conseil.",
    safetyNotes: ["Ne pas cumuler avec une supplémentation déjà en cours."],
    adjustPriority: (patient) =>
      patient.ageYears !== null && patient.ageYears >= 65 ? 12 : -8,
  },
  {
    key: "dry-mouth-hygiene",
    title: "Sécheresse buccale",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_OR_SIDE_EFFECT",
    needTriggers: ["DRY_MOUTH"],
    question: "Le patient a-t-il la bouche sèche depuis le début du traitement ?",
    category: "HYGIENE",
    atcPrefixes: ["N06A", "R06A", "N05A"],
    therapeuticClasses: ["Antihistaminique", "Antidépresseur", "Neuroleptique"],
    sideEffectTriggers: ["sécheresse buccale", "bouche sèche"],
    basePriority: 44,
    matchingTags: ["bouche sèche", "salive", "hygiène bucco-dentaire"],
    excludeTags: [],
    shortReasonTemplate:
      "Sécheresse buccale : effet fréquent de {drug}.",
    rationaleTemplate:
      "La sécheresse buccale figure parmi les effets fréquents de {drug}. Un conseil d'hygiène bucco-dentaire adapté peut améliorer le confort quotidien.",
    counterScriptTemplate:
      "« Vous avez la bouche sèche depuis le début du traitement ? C'est fréquent. {product} aide au confort, en complément du brossage. »",
    confirmedReasonTemplate: "Bouche sèche confirmée sous ce traitement.",
    patientReasonTemplate:
      "{drug} donne souvent la bouche sèche. {product} aide à retrouver du confort au quotidien.",
    clinicalContext: "Conseil de confort ; à évoquer si le patient rapporte la gêne.",
    safetyNotes: [],
  },
  {
    key: "iron-absorption-support",
    title: "Tolérance d'une supplémentation martiale",
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["CONSTIPATION"],
    category: "NUTRITION",
    atcPrefixes: ["B03A"],
    therapeuticClasses: ["Supplémentation en fer"],
    sideEffectTriggers: ["constipation", "troubles digestifs"],
    basePriority: 58,
    matchingTags: ["transit", "fibres", "confort digestif"],
    excludeTags: [],
    shortReasonTemplate:
      "Supplémentation martiale ({drug}) : absorption et tolérance digestive à surveiller.",
    rationaleTemplate:
      "Une supplémentation martiale ({drug}) entraîne fréquemment une constipation. Un accompagnement du transit peut favoriser l'observance.",
    counterScriptTemplate:
      "« Le fer ({drug}) ralentit souvent le transit. Prenez-le à distance du thé et du café, qui gênent son absorption. Si le transit devient difficile, {product} peut vous accompagner. »",
    patientReasonTemplate:
      "Le fer ({drug}) ralentit souvent le transit. {product} l'accompagne ; pensez à prendre le fer à distance du thé et du café.",
    clinicalContext:
      "Rappeler la prise à distance du thé et du café, qui réduisent l'absorption du fer.",
    safetyNotes: ["Orienter vers le médecin en cas de douleurs abdominales."],
  },
  {
    key: "sun-photosensitivity",
    benefits: ["Prévient la réaction au soleil", "Indice 50+ à privilégier", "À renouveler toutes les 2 heures"],
    title: "Photosensibilisation",
    kind: "SAFETY",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_OR_SIDE_EFFECT",
    needTriggers: ["PHOTOSENSITIVITY"],
    category: "DERMOCOSMETIQUE",
    atcPrefixes: ["J01A", "C03", "L01"],
    therapeuticClasses: ["Cycline", "Diurétique"],
    sideEffectTriggers: ["photosensibilisation", "photosensibilité"],
    basePriority: 88,
    matchingTags: ["protection solaire", "spf", "photoprotection"],
    excludeTags: [],
    shortReasonTemplate:
      "{drug} photosensibilise : l'exposition au soleil demande une précaution.",
    rationaleTemplate:
      "{drug} est associé à un risque de photosensibilisation. Une protection solaire est un conseil de sécurité, pas un simple conseil de confort.",
    counterScriptTemplate:
      "« Attention : pendant tout le traitement, {drug} rend la peau plus sensible au soleil. Évitez l'exposition directe et couvrez les zones découvertes — {product} est une protection adaptée. »",
    patientReasonTemplate:
      "Pendant tout le traitement, {drug} rend votre peau plus sensible au soleil. {product} protège les zones exposées.",
    clinicalContext:
      "Conseil prioritaire en période ensoleillée et pour toute exposition professionnelle.",
    safetyNotes: ["Rappeler d'éviter l'exposition directe pendant le traitement."],
  },
  // ---------------------------------------------------------------------------
  // Règles déclenchées par un BESOIN compris (contexte thérapeutique), pas par
  // une classe. Elles n'ont ni ATC ni classe : seule la compréhension du
  // traitement peut les activer, et chacune pose sa question au patient avant
  // de proposer quoi que ce soit.
  // ---------------------------------------------------------------------------
  {
    key: "nasal-hygiene-orl",
    benefits: ["Lave et dégage le nez", "Sans principe actif", "Compatible avec le traitement"],
    title: "Hygiène nasale en contexte ORL",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["NASAL_CONGESTION"],
    question: "Le patient a-t-il aussi le nez bouché ou qui coule ?",
    category: "SOINS",
    atcPrefixes: ["R06AE", "R06AX"],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 62,
    matchingTags: ["nez", "nasal", "lavage", "eau de mer", "orl", "spray nasal"],
    // « Lavage » est un mot partagé : un collyre ou un produit auriculaire ne
    // lave pas le nez. Écartés par leur nom.
    // Nez bouché confirmé : l'eau de mer hypertonique décongestionne, l'isotonique lave.
    productPrefer: [String.raw`hypertoni`, String.raw`decongestion`, String.raw`décongestion`, String.raw`actirub`, String.raw`aromaforce`, String.raw`\bforce\b`, String.raw`rhume`],
    productExclude: [String.raw`collyre`, String.raw`oculaire`, String.raw`ophtalm`, String.raw`\byeux\b`, String.raw`larmes`, String.raw`auriculaire`, String.raw`oreille`],
    // Un flacon de sérum physiologique ne se lave pas le nez tout seul : il
    // faut une seringue ou une poire de lavage. Le spray et la dosette, eux,
    // se suffisent.
    companion: {
      when: String.raw`(bouteille|flacon|(250|500|1000) ?ml)(?!.*(spray|pulv|dosette|unidose))`,
      // Par ordre de préférence : le dispositif nasal dédié d'abord, une
      // seringue sans aiguille ensuite. Jamais une seringue montée, à insuline
      // ou intramusculaire.
      productPatterns: [String.raw`seringue nasale`, String.raw`lavage (nasal|de nez)`, String.raw`poire (nasale|de lavage|a lavement)`, String.raw`rhino ?horn`, String.raw`irrigat`, String.raw`nasal ?kit`, String.raw`seringues? .*sans aig`],
      productExclude: [String.raw`\bim\b`, String.raw`montee`, String.raw`aig(uille)? (verte|orange|noire|bleue)`, String.raw`insuline`, String.raw`madeleine`, String.raw`effil`, String.raw`nutrisens`],
      label: "Seringue ou dispositif de lavage nasal",
      reason: "Pour administrer le sérum physiologique dans le nez et le laver correctement.",
    },
    excludeTags: [],
    shortReasonTemplate:
      "Contexte ORL ({drug}) : une gêne nasale est fréquente et l'ordonnance ne prévoit rien pour le nez.",
    rationaleTemplate:
      "Le traitement ({drug}) s'inscrit dans un contexte ORL ou respiratoire probable. Si le patient signale un nez bouché ou qui coule, un lavage nasal peut compléter la prise en charge.",
    counterScriptTemplate:
      "« Vous avez aussi le nez bouché ? {product} lave le nez et aide à le dégager, en complément de votre traitement. »",
    confirmedReasonTemplate: "Gêne nasale confirmée dans ce contexte ORL.",
    patientReasonTemplate:
      "Dans ce contexte ORL, vous signalez une gêne nasale. {product} lave le nez et aide à dégager les voies nasales, en complément de votre traitement.",
    clinicalContext:
      "À proposer uniquement si le patient confirme la gêne. Préférer une solution isotonique ; un vasoconstricteur relève d'un autre conseil.",
    safetyNotes: [
      "Ne remplace aucun traitement prescrit.",
      "Gêne persistante au-delà d'une semaine : orienter vers le médecin.",
    ],
  },
  {
    key: "sore-throat-orl",
    title: "Gorge irritée en contexte ORL",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["SORE_THROAT"],
    question: "Le patient a-t-il la gorge irritée ou douloureuse ?",
    category: "SOINS",
    atcPrefixes: [],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 58,
    matchingTags: ["gorge", "irritation", "orl", "pastilles", "miel"],
    excludeTags: [],
    shortReasonTemplate:
      "Contexte ORL ({drug}) : l'irritation de la gorge est fréquente et non prise en charge par l'ordonnance.",
    rationaleTemplate:
      "Le traitement ({drug}) s'inscrit dans un contexte ORL probable. Si le patient signale une gorge irritée, un soin local peut apaiser entre les prises.",
    counterScriptTemplate:
      "« Votre gorge est irritée ? {product} l'apaise entre les prises, sans remplacer votre traitement. »",
    confirmedReasonTemplate: "Gorge irritée confirmée dans ce contexte ORL.",
    patientReasonTemplate:
      "Vous signalez une gorge irritée dans ce contexte ORL. {product} apaise localement, en complément de votre traitement.",
    clinicalContext:
      "À proposer uniquement si le patient confirme la gêne. Douleur intense ou difficulté à avaler : orienter vers le médecin.",
    safetyNotes: ["Pastilles à éviter avant 6 ans (risque de fausse route)."],
  },
  {
    key: "cough-throat-comfort",
    title: "Toux irritante",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["COUGH_COMFORT"],
    question: "La toux irrite-t-elle la gorge du patient ?",
    category: "SOINS",
    atcPrefixes: [],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 50,
    matchingTags: ["toux", "gorge", "miel", "irritation"],
    excludeTags: [],
    shortReasonTemplate:
      "Toux plausible dans ce contexte ({drug}), sans traitement de la toux sur l'ordonnance.",
    rationaleTemplate:
      "Le contexte du traitement ({drug}) rend une toux plausible, et l'ordonnance ne la prend pas en charge. Un soin adoucissant peut être discuté si le patient la ressent.",
    counterScriptTemplate:
      "« La toux vous irrite la gorge ? {product} l'adoucit. Si elle dure plus d'une semaine, revoyez votre médecin. »",
    confirmedReasonTemplate: "Toux irritante confirmée, non traitée par l'ordonnance.",
    patientReasonTemplate:
      "La toux irrite votre gorge. {product} l'adoucit ; une toux qui dure doit être signalée à votre médecin.",
    clinicalContext:
      "Ne jamais proposer si un antitussif figure déjà sur l'ordonnance. Toux grasse : ne pas bloquer l'expectoration.",
    safetyNotes: ["Aucun sirop antitussif avant 2 ans sans avis médical."],
  },
  {
    key: "fever-thermometer",
    title: "Surveillance de la température",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["FEVER_MONITORING"],
    question: "La température doit-elle être surveillée à la maison ?",
    category: "DISPOSITIFS_MEDICAUX",
    atcPrefixes: [],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 46,
    matchingTags: ["thermomètre", "fièvre", "mesure"],
    excludeTags: [],
    shortReasonTemplate:
      "Contexte infectieux ({drug}) : la température se surveille à domicile.",
    rationaleTemplate:
      "Le traitement ({drug}) s'inscrit dans un contexte infectieux ou fébrile. Si le foyer n'est pas équipé, un thermomètre permet de suivre l'évolution et de savoir quand rappeler le médecin.",
    counterScriptTemplate:
      "« Pour suivre la température à la maison pendant le traitement, {product} permet de la mesurer simplement. »",
    confirmedReasonTemplate: "Surveillance de la température souhaitée à domicile.",
    patientReasonTemplate:
      "Pendant votre traitement, surveillez votre température. {product} permet de la mesurer à la maison.",
    clinicalContext: "Utile surtout pour un enfant, une personne âgée ou fragile.",
    safetyNotes: ["Fièvre au-delà de 3 jours ou supérieure à 39 °C : contacter le médecin."],
  },
  {
    key: "rehydration-digestive",
    title: "Réhydratation",
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["REHYDRATION"],
    question: "Y a-t-il des vomissements ou une diarrhée ?",
    category: "NUTRITION",
    atcPrefixes: [],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 64,
    matchingTags: ["réhydratation", "diarrhée", "sels minéraux"],
    excludeTags: [],
    shortReasonTemplate:
      "Diarrhée ou vomissements plausibles dans ce contexte ({drug}) : la réhydratation compte.",
    rationaleTemplate:
      "Le contexte du traitement ({drug}) rend une diarrhée ou des vomissements plausibles. Compenser les pertes en eau et en sels minéraux est le premier geste, surtout chez l'enfant et la personne âgée.",
    counterScriptTemplate:
      "« En cas de diarrhée ou de vomissements, {product} compense les pertes en eau et en sels. Au-delà de 48 heures, consultez. »",
    confirmedReasonTemplate: "Diarrhée ou vomissements confirmés : la réhydratation compte.",
    patientReasonTemplate:
      "En cas de diarrhée ou de vomissements, {product} compense les pertes en eau et en sels minéraux.",
    clinicalContext:
      "Nourrisson, personne âgée, diarrhée avec fièvre ou sang : orienter rapidement vers le médecin.",
    safetyNotes: ["Diarrhée persistante au-delà de 48 heures : consulter."],
  },
  {
    key: "eye-irritation-allergy",
    benefits: ["Apaise et lubrifie l'œil", "Sans principe actif", "Unidoses à privilégier"],
    title: "Yeux irrités en contexte allergique",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["ALLERGIC_EYE_IRRITATION"],
    question: "Les yeux du patient piquent-ils ou pleurent-ils ?",
    category: "SOINS",
    // Antihistaminiques de l'allergie (R06AE, R06AX) : pas les phénothiazines antitussives (oxomémazine, R06AD).
    atcPrefixes: ["D10BA01", "R06AE", "R06AX"],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 52,
    matchingTags: ["yeux", "oculaire", "collyre", "lavage", "larmes"],
    // Une irritation allergique se lave et s'hydrate ; elle ne se traite pas
    // avec un collyre antiseptique ou antibiotique, qui ont d'autres
    // indications et sont écartés par leur nom.
    productExclude: [String.raw`nasal`, String.raw`\bnez\b`, String.raw`rhino`, String.raw`desomedine`, String.raw`desosept`, String.raw`pommade`, String.raw`vitamine a`, String.raw`vita ?pos`, String.raw`hexamidine`, String.raw`antiseptique`, String.raw`antibio`, String.raw`tobramycine`, String.raw`tobrex`, String.raw`rifamycine`, String.raw`azyter`, String.raw`chloramphenicol`, String.raw`ofloxacine`, String.raw`ciprofloxacine`, String.raw`dexamethasone`, String.raw`cortico`],
    productPrefer: [String.raw`larmes`, String.raw`lavage`, String.raw`hydrat`, String.raw`serum phy`, String.raw`unidose`],
    excludeTags: [],
    shortReasonTemplate:
      "Contexte allergique ({drug}) : une irritation des yeux est fréquente.",
    rationaleTemplate:
      "Le traitement ({drug}) s'inscrit dans un contexte allergique. Si le patient signale des yeux qui piquent ou pleurent, un lavage oculaire peut apaiser.",
    counterScriptTemplate:
      "« Vos yeux piquent ? {product} lave l'œil et apaise l'irritation, en complément de votre traitement. »",
    confirmedReasonTemplate: "Irritation des yeux confirmée dans ce contexte allergique.",
    patientReasonTemplate:
      "Dans ce contexte allergique, {product} lave l'œil et apaise l'irritation.",
    clinicalContext: "Douleur oculaire, baisse de vision ou œil rouge unilatéral : orienter vers le médecin.",
    safetyNotes: ["Ne pas utiliser un collyre ouvert depuis plus d'un mois."],
  },
  // ---------------------------------------------------------------------------
  // Règle de classe ajoutée avec la compréhension du traitement : elle se
  // déclenche dès que le médicament est classé, par la fiche éditoriale ou par
  // l'IA. C'est un conseil d'observance, pas de confort : aucune question.
  // ---------------------------------------------------------------------------
  {
    key: "isotretinoin-skin-routine",
    title: "Routine peau sous isotrétinoïne",
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "DERMOCOSMETIQUE",
    atcPrefixes: ["D10BA01"],
    therapeuticClasses: ["Rétinoïde oral", "Isotrétinoïne"],
    sideEffectTriggers: [],
    basePriority: 74,
    // Les étiquettes vivent dans les étapes : la règle n'apparie rien elle-même.
    matchingTags: [],
    excludeTags: [],
    productExclude: [String.raw`gommage`, String.raw`exfoli`, String.raw`peeling`, String.raw`acide (glycolique|salicylique|lactique)`, String.raw`\baha\b`, String.raw`\bbha\b`, String.raw`retinol`, String.raw`scrub`],
    routine: {
      title: "Routine peau sous isotrétinoïne",
      steps: [
        {
          key: "cleanse",
          label: "Nettoyer",
          matchingTags: ["nettoyant", "visage"],
          productPrefer: [String.raw`sans savon`, String.raw`surgras`, String.raw`syndet`, String.raw`\bdoux`, String.raw`apais`, String.raw`purifiant`],
          benefit: "Nettoie en douceur, sans dessécher",
        },
        {
          key: "hydrate",
          label: "Hydrater et réparer",
          matchingTags: ["hydratation", "peau sensible", "apaisant", "émollient"],
          productExclude: [String.raw`\bcorps\b`, String.raw`\blait\b`, String.raw`pieds`, String.raw`mains`, String.raw`anti ?age`, String.raw`anti ?rides`, String.raw`solaire`, String.raw`\bspf`, String.raw`levres`, String.raw`lèvres`],
          productPrefer: [String.raw`visag`, String.raw`reparat`, String.raw`repair`, String.raw`apais`, String.raw`ceramide`, String.raw`hydra`, String.raw`relipid`, String.raw`cicalfate`, String.raw`cicaplast`],
          benefit: "Répare la barrière cutanée fragilisée",
        },
        {
          key: "protect",
          label: "Protéger",
          matchingTags: ["protection solaire", "spf", "photoprotection"],
          productExclude: [String.raw`apres ?soleil`, String.raw`après ?soleil`, String.raw`autobronz`, String.raw`\bhuile\b`, String.raw`\bhle\b`, String.raw`enfant`, String.raw`dermoped`, String.raw`\bkids\b`, String.raw`junior`, String.raw`\d+ ?mois`, String.raw`bebe`, String.raw`bébé`, String.raw`\blait\b`, String.raw`\bcorps\b`, String.raw`\bcorp\b`, String.raw`levre`, String.raw`lèvre`, String.raw`stick`, String.raw`brume`, String.raw`\bspr\b`, String.raw`spray`, String.raw`spf ?(15|20|30)\b`],
          // « 50 » ne figure pas ici : un motif préféré sauve une référence de l'exclusion, et un solaire enfant SPF 50 ne doit pas être sauvé.
          productPrefer: [String.raw`visag`, String.raw`\bvis\b`, String.raw`non comedog`, String.raw`fluide`, String.raw`oil control`, String.raw`peau grasse`, String.raw`dry touch`, String.raw`toucher sec`, String.raw`\bmat\b`],
          benefit: "Très haute protection, non comédogène",
        },
      ],
    },
    benefits: ["Peau moins sèche et moins irritée", "Barrière cutanée renforcée", "Protection solaire quotidienne"],
    shortReasonTemplate:
      "Isotrétinoïne ({drug}) : sécheresse de la peau et des muqueuses quasi constante pendant le traitement.",
    rationaleTemplate:
      "L'isotrétinoïne ({drug}) entraîne une sécheresse cutanée et muqueuse importante, et une photosensibilité. Une routine dermocosmétique adaptée — nettoyant doux, crème réparatrice, protection solaire — améliore le confort et la tolérance du traitement.",
    counterScriptTemplate:
      "« {drug} dessèche beaucoup la peau : un nettoyant doux, une crème réparatrice et une protection solaire chaque jour changent vraiment le confort. {product} est adapté à cette étape. »",
    patientReasonTemplate:
      "Votre traitement ({drug}) rend la peau sèche et fragile. {product} fait partie de la routine quotidienne qui la protège pendant la cure.",
    clinicalContext:
      "Sécheresse cutanéo-muqueuse et photosensibilité attendues sous isotrétinoïne orale ; éviter tout soin exfoliant ou irritant.",
    safetyNotes: [
      "Pas de gommage, d'acide exfoliant ni de rétinol cosmétique pendant le traitement.",
      "Protection solaire indispensable : photosensibilisation.",
    ],
  },
  {
    key: "lip-care-isotretinoin",
    title: "Lèvres sous isotrétinoïne",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "DERMOCOSMETIQUE",
    atcPrefixes: ["D10BA01"],
    therapeuticClasses: ["Rétinoïde oral", "Isotrétinoïne"],
    sideEffectTriggers: [],
    basePriority: 66,
    matchingTags: ["lèvres", "baume"],
    excludeTags: [],
    productPrefer: [String.raw`baume`, String.raw`stick`, String.raw`levres`, String.raw`lèvres`, String.raw`\blev\b`, String.raw`ceralip`, String.raw`cicaplast`, String.raw`reparat`],
    productExclude: [String.raw`gommage`, String.raw`exfoli`, String.raw`teint`, String.raw`gloss`, String.raw`rouge a levres`, String.raw`fievre`, String.raw`herpes`, String.raw`bouton`, String.raw`\bkids\b`, String.raw`chamallow`, String.raw`bubble`, String.raw`vanille`, String.raw`cola\b`, String.raw`\bmain`],
    benefits: ["Lèvres réparées", "À renouveler dans la journée", "Formule sans parfum à privilégier"],
    shortReasonTemplate:
      "Isotrétinoïne ({drug}) : la sécheresse des lèvres (chéilite) touche presque tous les patients.",
    rationaleTemplate:
      "La chéilite est l'effet indésirable le plus constant de l'isotrétinoïne ({drug}). Un baume réparateur appliqué plusieurs fois par jour la prévient et la soulage.",
    counterScriptTemplate:
      "« Avec {drug}, les lèvres se dessèchent presque toujours. {product}, plusieurs fois par jour dès le début du traitement, évite qu'elles ne craquent. »",
    patientReasonTemplate:
      "Votre traitement ({drug}) dessèche les lèvres. {product} s'applique plusieurs fois par jour pour les protéger.",
    clinicalContext: "Chéilite quasi constante sous isotrétinoïne orale.",
    safetyNotes: [],
  },
  {
    key: "herpes-zona-antiseptic",
    title: "Soin des lésions d'herpès ou de zona",
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["HERPES_LESION_CARE"],
    category: "SOINS",
    atcPrefixes: ["J05AB"],
    therapeuticClasses: ["Antiviral", "Antiherpétique"],
    sideEffectTriggers: [],
    basePriority: 72,
    matchingTags: ["antiseptique", "cutané"],
    excludeTags: [],
    // Biseptine d'abord : c'est l'antiseptique de référence des fiches conseil, sans alcool éthylique, adapté aux muqueuses.
    productPrefer: [String.raw`biseptine`, String.raw`hexomedine`, String.raw`diaseptyl`],
    productExclude: [String.raw`scrub`, String.raw`moussant`, String.raw`alcoolique`, String.raw`gargarisme`, String.raw`bain de bouche`, String.raw`vaginal`, String.raw`ovule`, String.raw`tulle`, String.raw`\bgel\b`, String.raw`dakin`, String.raw`eosine`, String.raw`ophtalm`, String.raw`collyre`, String.raw`oculaire`, String.raw`lavage`, String.raw`nasal`, String.raw`auriculaire`],
    benefits: ["Limite la surinfection", "Sur vésicules et croûtes", "Tamponner, sans frotter"],
    shortReasonTemplate:
      "Antiviral ({drug}) : les lésions d'herpès ou de zona peuvent se surinfecter tant qu'elles ne sont pas sèches.",
    rationaleTemplate:
      "{drug} traite l'infection virale ; il ne protège pas les lésions cutanées ou muqueuses d'une surinfection bactérienne. Un antiseptique cutané doux, appliqué sur les vésicules et croûtes jusqu'à cicatrisation, la limite. L'ordonnance ne prévoit aucun soin local.",
    counterScriptTemplate:
      "« {drug} agit sur le virus. Sur les boutons, tamponnez {product} matin et soir, sans frotter, jusqu'à ce qu'ils soient secs : cela évite qu'ils s'infectent. »",
    patientReasonTemplate:
      "Votre traitement ({drug}) agit sur le virus. {product}, tamponné sur les lésions jusqu'à ce qu'elles soient sèches, limite le risque d'infection.",
    clinicalContext:
      "Herpès labial, génital ou zona sous antiviral oral. Antisepsie locale douce des lésions (Cespharm — fiches conseil herpès et zona ; RCP valaciclovir). Atteinte oculaire : orientation médicale sans délai.",
    safetyNotes: [
      "Œil rouge, douloureux ou gêne visuelle : orientation médicale sans délai.",
      "Lavage des mains après chaque contact avec les lésions ; linge et serviettes à ne pas partager.",
    ],
  },
  {
    key: "herpes-labial-patch",
    title: "Bouton de fièvre",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["HERPES_LESION_CARE"],
    question: "Le patient a-t-il un bouton de fièvre sur les lèvres ?",
    confirmedReasonTemplate: "Bouton de fièvre confirmé sous {drug} : un patch protège la lésion et limite la contagion.",
    category: "SOINS",
    atcPrefixes: ["J05AB"],
    therapeuticClasses: ["Antiviral", "Antiherpétique"],
    sideEffectTriggers: [],
    basePriority: 58,
    matchingTags: ["herpès", "bouton de fièvre"],
    excludeTags: [],
    // Un antiviral local n'ajoute rien à l'antiviral oral prescrit : le patch, lui, protège et isole.
    productPrefer: [String.raw`patch`, String.raw`compeed`, String.raw`invisible`],
    productExclude: [String.raw`aciclovir`, String.raw`activir`, String.raw`herpevir`],
    benefits: ["Protège et isole la lésion", "Discret, se garde sous le maquillage", "Limite le contact avec les doigts"],
    shortReasonTemplate:
      "Herpès sous {drug} : sur les lèvres, la lésion se touche, se transmet et s'assèche mal.",
    rationaleTemplate:
      "Sous {drug}, un bouton de fièvre reste contagieux et exposé. Un patch hydrocolloïde le recouvre, limite les contacts et favorise la cicatrisation. L'antiviral local n'apporte rien de plus à l'antiviral oral.",
    counterScriptTemplate:
      "« Sur le bouton de fièvre, {product} le protège et évite qu'on le touche ; à changer quand il se décolle. »",
    patientReasonTemplate:
      "Avec {drug}, {product} recouvre le bouton de fièvre : il le protège, limite la contagion et aide à cicatriser.",
    clinicalContext: "Herpès labial récurrent ; patch hydrocolloïde en complément de l'antiviral (Cespharm — fiche conseil herpès labial).",
    safetyNotes: ["Ne pas appliquer sur un œil ni dans le nez ; lavage des mains après la pose."],
  },
  {
    key: "herpes-lysine",
    title: "Lysine en accompagnement de l'herpès",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["HERPES_LESION_CARE"],
    category: "NUTRITION",
    atcPrefixes: ["J05AB"],
    therapeuticClasses: ["Antiviral", "Antiherpétique"],
    sideEffectTriggers: [],
    basePriority: 60,
    matchingTags: ["lysine"],
    excludeTags: [],
    productExclude: [String.raw`aspegic`, String.raw`acetylsalicyl`, String.raw`aspirine`],
    benefits: ["Conseil classique de l'officine sur l'herpès", "Cure courte, dès la poussée", "Ne remplace pas l'antiviral"],
    shortReasonTemplate:
      "Herpès sous {drug} : la lysine est traditionnellement proposée en accompagnement des poussées et pour espacer les récidives.",
    rationaleTemplate:
      "En accompagnement de {drug}, la L-lysine est un conseil classique de l'officine sur l'herpès : quelques études anciennes de petite taille suggèrent des récidives moins fréquentes à dose élevée, et les revues récentes jugent les preuves limitées. Elle peut être proposée en cure courte, sans promesse, jamais à la place de l'antiviral.",
    counterScriptTemplate:
      "« En plus de {drug}, {product} est souvent conseillé pendant une poussée d'herpès et pour espacer les suivantes : une cure courte, dès maintenant. Ça ne remplace pas votre traitement. »",
    patientReasonTemplate:
      "En complément de {drug}, {product} est un conseil habituel de l'officine sur l'herpès, en cure courte. Il ne remplace pas votre traitement.",
    clinicalContext:
      "Complément alimentaire. Données cliniques limitées (Griffith 1987 ; revues récentes : preuves insuffisantes). Déconseillé en cas d'insuffisance rénale ; pas de complément pendant la grossesse sans avis.",
    safetyNotes: ["Complément alimentaire, sans effet démontré sur le virus : ne remplace pas l'antiviral."],
    blockedFor: (patient) =>
      patient.renalImpairment
        ? "Insuffisance rénale déclarée : un apport en acides aminés relève d'un avis médical."
        : patient.isPregnant
          ? "Grossesse déclarée : pas de complément alimentaire sans avis médical."
          : null,
  },
  {
    key: "herpes-zona-skin-repair",
    title: "Réparation de la peau après les vésicules",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["HERPES_LESION_CARE"],
    category: "DERMOCOSMETIQUE",
    atcPrefixes: ["J05AB"],
    therapeuticClasses: ["Antiviral", "Antiherpétique"],
    sideEffectTriggers: [],
    basePriority: 56,
    matchingTags: ["cicatrisant", "apaisant"],
    excludeTags: [],
    productPrefer: [String.raw`cicalfate`, String.raw`cicaplast`, String.raw`cicabio`, String.raw`repar`, String.raw`sensicalm`],
    productExclude: [String.raw`spf`, String.raw`solaire`, String.raw`nettoy`, String.raw`lavant`, String.raw`gel net`, String.raw`lotion`, String.raw`levres`, String.raw`lèvres`, String.raw`\blev\b`],
    benefits: ["Apaise et répare une fois les lésions sèches", "Sans parfum à privilégier", "Après l'antiseptique"],
    shortReasonTemplate:
      "Après les vésicules d'herpès ou de zona sous {drug}, la peau reste irritée et met du temps à se réparer.",
    rationaleTemplate:
      "Une fois les lésions sèches, la peau traitée par {drug} reste irritée. Une crème réparatrice apaisante, sans parfum, accompagne la cicatrisation et limite les marques.",
    counterScriptTemplate:
      "« Quand les boutons seront secs, {product} apaise et aide la peau à se réparer sans laisser de marque. »",
    patientReasonTemplate:
      "Après les lésions traitées par {drug}, {product} apaise la peau et l'aide à se réparer.",
    clinicalContext: "Phase de cicatrisation de l'herpès ou du zona (Cespharm — fiche conseil zona).",
    safetyNotes: ["Jamais sur des vésicules encore ouvertes : d'abord l'antiseptique, la crème une fois sec."],
  },
  {
    key: "hand-hygiene-contagious",
    title: "Hygiène des mains, lésions contagieuses",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["HERPES_LESION_CARE"],
    category: "HYGIENE",
    atcPrefixes: ["J05AB"],
    therapeuticClasses: ["Antiviral", "Antiherpétique"],
    sideEffectTriggers: [],
    basePriority: 44,
    matchingTags: ["hygiène des mains"],
    excludeTags: [],
    benefits: ["Après chaque contact avec la lésion", "Protège l'entourage et les yeux", "Format poche"],
    shortReasonTemplate:
      "Herpès ou zona sous {drug} : le virus se transmet par les mains tant que les lésions ne sont pas sèches.",
    rationaleTemplate:
      "Les lésions d'herpès et de zona traitées par {drug} sont contagieuses jusqu'à l'assèchement ; l'auto-inoculation oculaire est le risque principal. La friction des mains après chaque contact est le geste clé.",
    counterScriptTemplate:
      "« Tant que ce n'est pas sec, c'est contagieux : {product} après chaque fois que vous touchez les boutons, et jamais les yeux sans s'être lavé les mains. »",
    patientReasonTemplate:
      "Les lésions traitées par {drug} restent contagieuses : {product} après chaque contact protège vos yeux et votre entourage.",
    clinicalContext: "Prévention de l'auto-inoculation et de la transmission (Cespharm — herpès et zona).",
    safetyNotes: [],
  },
  {
    key: "opioid-transit",
    title: "Transit sous antalgique opioïde",
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["CONSTIPATION"],
    category: "NUTRITION",
    atcPrefixes: ["N02A", "R05DA"],
    therapeuticClasses: ["Opioïde", "Antalgique opioïde", "Antalgique de palier 2", "Antalgique de palier 3"],
    sideEffectTriggers: [],
    basePriority: 70,
    matchingTags: ["transit", "fibres", "confort digestif"],
    excludeTags: [],
    productPrefer: [String.raw`macrogol`, String.raw`forlax`, String.raw`movicol`, String.raw`transipeg`, String.raw`lactulose`, String.raw`fibres`, String.raw`psyllium`],
    benefits: ["Prévient la constipation attendue", "Dès le début du traitement", "Boire suffisamment"],
    shortReasonTemplate:
      "Opioïde ({drug}) : la constipation est un effet quasi constant, dès les premiers jours.",
    rationaleTemplate:
      "Les antalgiques opioïdes ({drug}) ralentissent le transit chez la plupart des patients, sans accoutumance à cet effet. Un laxatif osmotique ou un apport en fibres, commencé avec le traitement, prévient la constipation plutôt que de la traiter.",
    counterScriptTemplate:
      "« {drug} constipe presque toujours. {product} dès aujourd'hui, avec un grand verre d'eau, évite d'en arriver là. »",
    patientReasonTemplate:
      "Votre antalgique ({drug}) ralentit le transit chez presque tout le monde. {product}, pris dès le début, prévient la constipation.",
    clinicalContext:
      "RCP tramadol, codéine, morphiniques : constipation très fréquente. HAS (douleur, opioïdes) : prévention systématique de la constipation par un laxatif, dès l'instauration.",
    safetyNotes: ["Douleur abdominale intense ou absence de selles prolongée : avis médical."],
  },
  {
    key: "hypertension-self-measurement",
    title: "Automesure de la tension",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    question: "Le patient souhaite-t-il suivre sa tension à domicile ?",
    confirmedReasonTemplate: "Traitement antihypertenseur ({drug}) et patient volontaire pour l'automesure : la HAS la recommande pour ajuster le traitement.",
    category: "DISPOSITIFS_MEDICAUX",
    atcPrefixes: ["C02", "C03", "C07", "C08", "C09"],
    therapeuticClasses: ["Antihypertenseur", "Inhibiteur de l'enzyme de conversion", "Bêtabloquant", "Inhibiteur calcique", "Antagoniste de l'angiotensine II", "Diurétique"],
    sideEffectTriggers: [],
    basePriority: 50,
    matchingTags: ["tensiomètre"],
    excludeTags: [],
    productPrefer: [String.raw`bras`, String.raw`omron`, String.raw`valid`],
    benefits: ["Recommandée par la HAS", "Mesure au bras, automatique", "3 mesures matin et soir, 3 jours"],
    shortReasonTemplate:
      "Traitement antihypertenseur ({drug}) : l'automesure à domicile guide l'ajustement du traitement.",
    rationaleTemplate:
      "Sous {drug}, la mesure de la tension à domicile, selon la règle des 3 (trois mesures matin et soir pendant trois jours), est recommandée pour confirmer l'efficacité du traitement et éviter l'effet blouse blanche. Un tensiomètre validé, au bras, est l'outil de référence.",
    counterScriptTemplate:
      "« Avec {drug}, mesurer sa tension chez soi aide le médecin à régler le traitement. {product} se met au bras ; trois mesures matin et soir, trois jours avant la consultation. »",
    patientReasonTemplate:
      "Votre traitement ({drug}) se règle mieux avec vos mesures à domicile. {product} se place au bras : trois mesures matin et soir, pendant trois jours, à montrer à votre médecin.",
    clinicalContext: "HAS, prise en charge de l'hypertension artérielle de l'adulte (2016) : automesure tensionnelle recommandée, appareil validé, brassard huméral.",
    safetyNotes: [],
  },
  {
    key: "diabetes-foot-care",
    title: "Soin des pieds sous traitement antidiabétique",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "SOINS",
    atcPrefixes: ["A10"],
    therapeuticClasses: ["Antidiabétique", "Insuline", "Biguanide", "Sulfamide hypoglycémiant"],
    sideEffectTriggers: [],
    basePriority: 54,
    matchingTags: ["pieds", "hydratation"],
    excludeTags: [],
    productPrefer: [String.raw`uree`, String.raw`urée`, String.raw`urea`, String.raw`pied`],
    productExclude: [String.raw`detransp`, String.raw`deodor`, String.raw`sport`, String.raw`spray`],
    benefits: ["Prévient sécheresse et crevasses", "Hors espaces entre les orteils", "Avec l'inspection quotidienne des pieds"],
    shortReasonTemplate:
      "Diabète traité ({drug}) : une peau des pieds sèche se fissure, et une plaie du pied se soigne mal.",
    rationaleTemplate:
      "Chez un patient traité par {drug}, la peau des pieds est souvent sèche et les plaies cicatrisent lentement. Une crème hydratante quotidienne, en évitant les espaces entre les orteils, fait partie des soins du pied recommandés, avec l'inspection quotidienne.",
    counterScriptTemplate:
      "« Avec le diabète, les pieds demandent un soin chaque jour : {product} le soir, sans en mettre entre les orteils, et un coup d'œil pour vérifier qu'il n'y a pas de plaie. »",
    patientReasonTemplate:
      "Avec votre traitement ({drug}), la peau des pieds se dessèche et se blesse facilement. {product} chaque soir, sans en mettre entre les orteils, la protège.",
    clinicalContext: "HAS / SFD, prévention des plaies du pied chez le diabétique : hygiène et hydratation quotidiennes, inspection, chaussage adapté.",
    safetyNotes: ["Plaie, rougeur ou ongle incarné : consultation sans attendre ; jamais d'automédication sur une plaie du pied diabétique."],
  },
  {
    key: "cough-bronchial-essential-oils",
    title: "Confort respiratoire pendant la toux",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["COUGH_COMFORT"],
    category: "PHYTOTHERAPIE",
    atcPrefixes: ["R05D", "R05C", "R06AD08"],
    therapeuticClasses: ["Antitussif", "Expectorant", "Mucolytique"],
    sideEffectTriggers: [],
    basePriority: 48,
    matchingTags: ["huiles essentielles", "bronches"],
    excludeTags: [],
    productPrefer: [String.raw`bronch`, String.raw`respir`],
    productExclude: [String.raw`diffus`, String.raw`roll`, String.raw`piqure`, String.raw`tete`, String.raw`urin`, String.raw`gorge`, String.raw`nasal`, String.raw`\bnez\b`, String.raw`lotion`, String.raw`spray`, String.raw`assainiss`],
    benefits: ["Complément du sirop, pas un remplaçant", "Cure courte, le temps de la toux", "Jamais chez l'asthmatique ni l'épileptique"],
    shortReasonTemplate:
      "Toux traitée ({drug}) : en aromathérapie, les huiles essentielles sont traditionnellement utilisées pour le confort respiratoire.",
    rationaleTemplate:
      "Le patient tousse ({drug}). Les capsules d'huiles essentielles à visée respiratoire sont un conseil classique de l'officine, en complément du traitement ; leur effet n'est pas démontré par des essais cliniques, et leurs contre-indications sont strictes : asthme, épilepsie, grossesse, allaitement, enfant.",
    counterScriptTemplate:
      "« En plus de {drug}, {product} est souvent conseillé le temps de la toux, pour le confort des bronches. Pas si vous êtes asthmatique ou épileptique, ni enceinte. »",
    patientReasonTemplate:
      "Pendant votre toux, {product} accompagne {drug} pour le confort respiratoire, en cure courte. Contre-indiqué en cas d'asthme, d'épilepsie ou de grossesse.",
    clinicalContext:
      "Aromathérapie à visée respiratoire : usage traditionnel, sans preuve clinique ; ANSM — huiles essentielles, précautions d'emploi (asthme, épilepsie, grossesse, enfant).",
    safetyNotes: ["Contre-indiqué en cas d'asthme, d'épilepsie, de grossesse, d'allaitement et avant 12 ans."],
    blockedFor: (patient) =>
      patient.chronicConditions.some((c) => /asthm|epilep|épilep|convuls/i.test(c))
        ? "Asthme ou épilepsie déclarés : les huiles essentielles sont contre-indiquées."
        : patient.isPregnant || patient.isBreastfeeding
          ? "Grossesse ou allaitement : les huiles essentielles sont contre-indiquées."
          : patient.ageYears !== null && patient.ageYears < 12
            ? "Avant 12 ans, les huiles essentielles sont contre-indiquées."
            : null,
  },
  {
    key: "convalescence-immunity-vitamins",
    title: "Vitamines pendant la convalescence",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    question: "Le patient se sent-il fatigué par cette infection ?",
    confirmedReasonTemplate: "Infection traitée ({drug}) et fatigue confirmée : une cure de vitamines accompagne la convalescence.",
    category: "VITAMINES",
    atcPrefixes: ["J01", "J05AB"],
    therapeuticClasses: ["Antibiotique", "Antibactérien", "Antiviral"],
    sideEffectTriggers: [],
    basePriority: 46,
    matchingTags: ["vitamines", "immunité"],
    excludeTags: [],
    productPrefer: [String.raw`immun`, String.raw`vitamine 22`, String.raw`azinc`, String.raw`berocca`, String.raw`supradyn`, String.raw`multivit`],
    productExclude: [String.raw`enfant`, String.raw`\bkids\b`, String.raw`pediakid`, String.raw`junior`, String.raw`gom`, String.raw`ourson`, String.raw`bebe`, String.raw`bébé`, String.raw`cheveux`, String.raw`ongles`, String.raw`solaire`],
    benefits: ["Vitamines C, D et zinc : contribuent au fonctionnement normal du système immunitaire", "Cure de 3 à 4 semaines", "Vérifier l'absence de doublon avec une vitamine déjà prise"],
    shortReasonTemplate:
      "Infection traitée ({drug}) : la convalescence fatigue, surtout quand l'appétit a baissé.",
    rationaleTemplate:
      "Sous {drug}, le patient dit être fatigué par l'infection. Une cure de vitamines et minéraux couvre des apports souvent réduits pendant quelques jours ; les vitamines C, D et le zinc portent une allégation autorisée sur le fonctionnement normal du système immunitaire. Ce n'est ni un traitement ni une garantie de récupération plus rapide.",
    counterScriptTemplate:
      "« Le temps de récupérer de cette infection, {product} en cure de quelques semaines aide à couvrir vos apports, en complément de {drug}. »",
    patientReasonTemplate:
      "Pendant votre convalescence, {product} complète vos apports en vitamines et minéraux, le temps de retrouver la forme après {drug}.",
    clinicalContext:
      "Allégations de santé autorisées (règlement UE 432/2012) : vitamines C, D, B6, B12, zinc, sélénium et fer contribuent au fonctionnement normal du système immunitaire. Aucune preuve d'une convalescence plus rapide.",
    safetyNotes: ["Pas de cumul avec une autre supplémentation vitaminique ; grossesse : avis médical."],
    blockedFor: (patient) => (patient.isPregnant ? "Grossesse déclarée : pas de complément multivitaminé sans avis médical." : null),
  },
  {
    key: "dry-eye-screen-lubricant",
    title: "Sécheresse oculaire et écrans",
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "SOINS",
    // Substituts lacrymaux : larmes artificielles et gels (S01XA20, S01KA).
    atcPrefixes: ["S01XA20", "S01KA"],
    therapeuticClasses: ["Substitut lacrymal", "Larmes artificielles", "Lubrifiant oculaire", "Traitement de la sécheresse oculaire"],
    sideEffectTriggers: [],
    basePriority: 66,
    matchingTags: ["sécheresse oculaire", "larmes"],
    excludeTags: [],
    // Ordonnés : devant un écran, la formule « écran » d'abord, puis l'acide hyaluronique, puis les autres lubrifiants.
    productPrefer: [String.raw`ecran`, String.raw`écran`, String.raw`hyaluron`, String.raw`aqualarm`, String.raw`hylo`, String.raw`vismed`, String.raw`hyabak`, String.raw`thealoz`, String.raw`sans conservateur`],
    productExclude: [String.raw`antiseptique`, String.raw`desomedine`, String.raw`desosept`, String.raw`pommade`, String.raw`lavage`, String.raw`dacryoserum`, String.raw`allergi`, String.raw`antihistamin`, String.raw`vasoconstric`, String.raw`blanchi`, String.raw`biocanina`, String.raw`lotion`, String.raw`paupi`, String.raw`lingette`],
    benefits: ["Acide hyaluronique : lubrifie plus longtemps", "En complément du traitement prescrit, pas à sa place", "Sans conservateur à privilégier"],
    shortReasonTemplate:
      "Substitut lacrymal prescrit ({drug}) : l'œil est sec, et devant les écrans on cligne deux fois moins.",
    rationaleTemplate:
      "{drug} traite une sécheresse oculaire. Devant les écrans, le clignement se raréfie et le film lacrymal s'évapore plus vite : un lubrifiant à l'acide hyaluronique, sans conservateur, complète le traitement prescrit dans la journée, sans le remplacer. Les mentions « écran » ou « lumière bleue » de certains produits ne sont pas des preuves d'effet : c'est l'acide hyaluronique qui fait le travail.",
    counterScriptTemplate:
      "« {drug} réhydrate l'œil, continuez-le. Devant les écrans, {product} en complément dans la journée garde l'œil lubrifié plus longtemps : une goutte quand ça tire, et une pause toutes les 20 minutes. »",
    patientReasonTemplate:
      "Votre traitement ({drug}) hydrate l'œil. {product} le complète dans la journée, surtout devant les écrans, pour que l'œil reste lubrifié plus longtemps.",
    clinicalContext:
      "Sécheresse oculaire, dysfonction lacrymale liée aux écrans. Lubrifiants à l'acide hyaluronique en première intention (SFO / TFOS DEWS II) ; produits sans conservateur si usage fréquent. Aucune preuve d'un bénéfice propre des filtres « lumière bleue ».",
    safetyNotes: ["Œil rouge et douloureux, baisse de la vision : orientation médicale sans délai.", "Espacer les collyres d'au moins cinq minutes ; un gel toujours en dernier."],
  },
  {
    key: "dry-eye-eyelid-care",
    title: "Hygiène des paupières",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    question: "Le patient a-t-il les paupières collées le matin, ou des croûtes à la base des cils ?",
    confirmedReasonTemplate: "Sécheresse oculaire ({drug}) avec paupières collées : les glandes des paupières sont en cause, et se soignent par l'hygiène.",
    category: "SOINS",
    atcPrefixes: ["S01XA20", "S01KA"],
    therapeuticClasses: ["Substitut lacrymal", "Larmes artificielles", "Lubrifiant oculaire"],
    sideEffectTriggers: [],
    basePriority: 54,
    matchingTags: ["paupières"],
    excludeTags: [],
    benefits: ["Traite la cause quand les glandes sont bouchées", "Matin et soir, en cure", "Compresses chaudes puis nettoyage"],
    shortReasonTemplate:
      "Sécheresse oculaire ({drug}) : quand les paupières collent, ce sont leurs glandes qui manquent, et l'hygiène des paupières les débouche.",
    rationaleTemplate:
      "Une sécheresse oculaire sous {drug} avec paupières collées ou croûtes évoque une dysfonction des glandes de Meibomius : la chaleur puis le nettoyage des paupières, matin et soir, sont le traitement de fond recommandé, avant tout collyre supplémentaire.",
    counterScriptTemplate:
      "« Si les paupières collent, c'est la base des cils qu'il faut nettoyer : {product} matin et soir, après une compresse chaude, et {drug} continue. »",
    patientReasonTemplate:
      "Avec {drug}, {product} nettoie la base des cils matin et soir : c'est là que se forme la sécheresse quand les paupières collent.",
    clinicalContext: "Dysfonction des glandes de Meibomius : hygiène palpébrale (chaleur, massage, nettoyage) en première intention — TFOS DEWS II, SFO.",
    safetyNotes: ["Paupière gonflée, douloureuse ou œil rouge : consultation."],
  },
  {
    key: "pain-cold-hot-pack",
    title: "Chaud ou froid sur la douleur",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    question: "La douleur est-elle musculaire ou articulaire (entorse, tendinite, lombalgie, contracture) ?",
    confirmedReasonTemplate: "Douleur musculaire ou articulaire confirmée sous {drug} : le froid sur une entorse récente, le chaud sur une contracture, complètent l'antalgique.",
    category: "DISPOSITIFS_MEDICAUX",
    atcPrefixes: ["M01A", "M02AA", "M03B", "N02BE", "N02A"],
    therapeuticClasses: ["Anti-inflammatoire non stéroïdien", "Myorelaxant", "Antalgique"],
    sideEffectTriggers: [],
    basePriority: 44,
    matchingTags: ["chaud froid", "douleur musculaire"],
    excludeTags: [],
    productPrefer: [String.raw`chaud ?froid`, String.raw`thera ?pearl`, String.raw`thermcool`, String.raw`poche`],
    productExclude: [String.raw`\bkids\b`, String.raw`enfant`, String.raw`bouillotte`],
    benefits: ["Froid les 48 premières heures d'une entorse", "Chaud sur une contracture", "Sans médicament, en plus du traitement"],
    shortReasonTemplate:
      "Antalgique ou anti-inflammatoire ({drug}) : sur une douleur musculaire ou articulaire, le froid ou le chaud local soulage en plus.",
    rationaleTemplate:
      "Sous {drug}, une douleur d'origine musculaire ou articulaire répond aussi au traitement local par la température : le froid limite l'œdème et la douleur d'une entorse ou d'un traumatisme récent, la chaleur détend une contracture ou une lombalgie. Une poche réutilisable sert aux deux.",
    counterScriptTemplate:
      "« En plus de {drug}, {product} : au froid les deux premiers jours sur une entorse, au chaud sur une contracture, vingt minutes, jamais directement sur la peau. »",
    patientReasonTemplate:
      "En complément de {drug}, {product} s'applique vingt minutes : froid sur une entorse récente, chaud sur une contracture, toujours à travers un linge.",
    clinicalContext: "Traumatologie bénigne : protocole GREC (glace, repos, élévation, compression) ; thermothérapie des contractures. HAS — prise en charge des entorses de cheville.",
    safetyNotes: ["Jamais directement sur la peau, vingt minutes au plus ; pas de chaud sur une inflammation aiguë ni sur une peau insensible."],
  },
  {
    key: "antibiotic-intimate-care",
    title: "Confort intime pendant l'antibiothérapie",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    question: "La patiente est-elle sujette aux mycoses ou aux irritations intimes après un antibiotique ?",
    confirmedReasonTemplate: "Antibiothérapie ({drug}) chez une patiente sujette aux mycoses : préserver la flore vaginale se prépare dès la cure.",
    category: "HYGIENE",
    atcPrefixes: ["J01"],
    therapeuticClasses: ["Antibiotique", "Antibactérien"],
    sideEffectTriggers: [],
    basePriority: 46,
    matchingTags: ["hygiène intime", "flore vaginale"],
    excludeTags: [],
    productPrefer: [String.raw`intima`, String.raw`cnd`, String.raw`physioflor`, String.raw`gynophilus`, String.raw`probiot`, String.raw`saforelle`],
    productExclude: [String.raw`lingette`, String.raw`homme`],
    benefits: ["Un antibiotique déséquilibre aussi la flore vaginale", "Hygiène douce, sans savon", "Probiotique intime en cure"],
    shortReasonTemplate:
      "Antibiothérapie ({drug}) : la flore vaginale est déséquilibrée comme la flore intestinale, et la mycose suit souvent.",
    rationaleTemplate:
      "Une antibiothérapie ({drug}) fragilise la flore vaginale et favorise la candidose chez les patientes qui y sont sujettes. Une hygiène intime douce et, le cas échéant, un probiotique à visée vaginale accompagnent la cure.",
    counterScriptTemplate:
      "« Avec {drug}, si vous faites facilement des mycoses, {product} pendant la cure aide à garder l'équilibre intime. »",
    patientReasonTemplate:
      "Votre antibiotique ({drug}) peut déséquilibrer la flore intime. {product} l'accompagne pendant la cure.",
    clinicalContext: "Candidose vulvo-vaginale post-antibiotique : facteur de risque documenté (RCP des antibiotiques à large spectre ; CNGOF). Probiotiques vaginaux : données limitées, usage courant.",
    safetyNotes: ["Pertes inhabituelles, fièvre ou douleurs : consultation."],
    blockedFor: (patient) => (patient.sex === "MALE" ? "Conseil réservé aux patientes." : null),
  },
  {
    key: "mouth-rinse-inhaled-corticosteroid",
    benefits: ["Limite les mycoses buccales", "Après chaque inhalation", "Formule sans alcool"],
    title: "Rinçage de bouche après corticoïde inhalé",
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "HYGIENE",
    atcPrefixes: ["R03BA", "R03AK"],
    therapeuticClasses: ["Corticoïde inhalé", "Corticostéroïde inhalé"],
    sideEffectTriggers: [],
    basePriority: 66,
    // « Bain de bouche » et « rinçage » avant tout : un spray pour bouche sèche
    // partage les mots « bouche » et « buccale » mais ne sert pas à rincer —
    // il est sorti au comptoir avant ce resserrement.
    matchingTags: ["bain de bouche", "rinçage", "bucco-dentaire"],
    // Un produit hydratant pour bouche sèche partage la catégorie et les mots,
    // mais il ne rince pas : il est écarté, pas départagé.
    excludeTags: ["hydratation"],
    // Après un corticoïde inhalé, un bain de bouche alcoolisé irrite et
    // déséquilibre la flore buccale : les formules connues pour contenir de
    // l'alcool sont écartées, sauf mention « sans alcool ». Liste à valider par
    // un pharmacien, comme la règle elle-même.
    productExclude: [String.raw`alcool`, String.raw`eludril(?! ?(pro|care|junior))`, String.raw`listerine`, String.raw`alodont`, String.raw`hextril`, String.raw`givalex`],
    productPrefer: [String.raw`sans alcool`, String.raw`0 ?% ?alcool`, String.raw`zero`, String.raw`zéro`],
    shortReasonTemplate:
      "Corticoïde inhalé ({drug}) : rincer la bouche après chaque prise limite les mycoses buccales.",
    rationaleTemplate:
      "{drug} est un corticoïde inhalé : sans rinçage de la bouche après chaque inhalation, la candidose buccale et l'enrouement sont fréquents. Le rappel du geste est un conseil d'observance, éventuellement accompagné.",
    counterScriptTemplate:
      "« Après chaque inhalation de {drug}, rincez-vous la bouche et recrachez. {product} peut compléter ce rinçage. »",
    patientReasonTemplate:
      "Après chaque inhalation de {drug}, rincez-vous la bouche et recrachez. {product} peut servir à ce rinçage.",
    clinicalContext:
      "Rappeler aussi la technique d'inhalation et l'usage de la chambre d'inhalation si elle est prescrite.",
    safetyNotes: [],
  },
];

const norm = (value: string) => value.toLowerCase().trim();

/**
 * « BÉCLOMÉTASONE (DIPROPIONATE DE) » → « BÉCLOMÉTASONE ». Le sel n'apporte
 * rien à une raison lue en une seconde, et il double la longueur de la ligne.
 */
/**
 * La substance telle qu'on la lit au comptoir : sans le sel ni l'hydrate.
 * « CHLORHYDRATE DE VALACICLOVIR » se lit « VALACICLOVIR », « LÉVOTHYROXINE
 * SODIQUE » se lit « LÉVOTHYROXINE ».
 */
function shortSubstance(value: string | null | undefined): string | null {
  if (!value) return null;
  const SALT_PREFIX = /^(chlorhydrate|dichlorhydrate|sulfate|acetate|acétate|maleate|maléate|mesilate|mésilate|tartrate|citrate|bromhydrate|fumarate|hemifumarate|hémifumarate|succinate|besilate|bésilate|phosphate|nitrate|carbonate|gluconate|diglusonate|digluconate|lactate|oxalate|valerate|valérate|propionate|dipropionate|sodium|potassium|calcium|magnesium|magnésium)\s+(d[e']\s*|de\s+l'\s*)?/i;
  const SALT_SUFFIX = /\s+(sodique|potassique|calcique|magnesique|magnésique|monosodique|disodique|sodium|potassium|magnesium|magnésium|monohydrate|monohydraté|monohydratee|monohydratée|dihydrate|dihydraté|dihydratee|dihydratée|trihydrate|trihydraté|trihydratee|trihydratée|hemihydrate|hémihydraté|hemihydratee|hémihydratée|anhydre|micronise|micronisé|micronisee|micronisée)\b/gi;
  const cleaned = value
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(SALT_PREFIX, "")
    .replace(SALT_SUFFIX, "")
    .trim();
  return cleaned || value.trim() || null;
}

/**
 * Détermine les opportunités pertinentes pour un traitement donné.
 * Aucun produit n'est consulté à ce stade — c'est volontaire.
 */
export function detectAdviceOpportunities(params: {
  drugs: {
    lineIndex: number;
    drugName: string;
    knowledge: DrugKnowledge | null;
    /**
     * Nom officiel de la spécialité, quand la ligne a été rattachée au
     * catalogue national. On le préfère au texte du prescripteur pour nommer
     * le déclencheur : « AMODEX 1 g » est vérifiable, « Amoxicilline 1 g » est
     * une transcription.
     */
    officialName?: string | null;
    /**
     * Substance active publiée. C'est elle qui nomme le déclencheur dans la
     * raison courte : « AMOXICILLINE » se lit d'un coup d'œil au comptoir, là
     * où « AMOXICILLINE ARROW 1 g, comprimé dispersible » fait une ligne à lui
     * seul.
     */
    officialSubstance?: string | null;
  }[];
  patient: PatientContext;
  /**
   * Les besoins identifiés par la compréhension du traitement, déjà validés
   * par le domaine. Ils ne remplacent pas la couche éditoriale : ils
   * s'ajoutent à elle, et une règle ne s'en sert que si elle l'a déclaré.
   */
  needs?: IdentifiedNeed[];
}): AdviceOpportunityResult[] {
  const { drugs, patient, needs = [] } = params;
  const byKey = new Map<string, AdviceOpportunityResult>();

  for (const rule of ADVICE_RULES) {
    const triggers: {
      lineIndex: number;
      drugName: string;
      officialName: string;
      shortLabel: string;
    }[] = [];
    let matchStrength = 0;

    for (const drug of drugs) {
      const knowledge = drug.knowledge;
      if (!knowledge) continue;

      const atc = knowledge.atcCode ?? "";
      const therapeuticClass = norm(knowledge.therapeuticClass ?? "");
      const sideEffects = knowledge.commonSideEffects.map(norm);

      const atcHit = rule.atcPrefixes.some((prefix) => atc.startsWith(prefix));
      const classHit = rule.therapeuticClasses.some((c) =>
        therapeuticClass.includes(norm(c)),
      );
      const sideEffectHit = rule.sideEffectTriggers.some((trigger) =>
        sideEffects.some((effect) => effect.includes(norm(trigger))),
      );

      const classHitAny = atcHit || classHit;

      // Une règle qui affirme quelque chose sur la classe du médicament ne peut
      // pas se déclencher sur un simple effet indésirable partagé : cela
      // produirait une justification fausse (« Amoxicilline est une
      // supplémentation martiale »).
      const triggered =
        rule.triggerMode === "CLASS_ONLY"
          ? classHitAny
          : classHitAny || sideEffectHit;

      if (!triggered) continue;

      triggers.push({
        lineIndex: drug.lineIndex,
        // Ce qu'on DIT au patient est le nom écrit sur son ordonnance — celui
        // qu'il lira sur la boîte — pas la dénomination officielle complète.
        drugName: drug.drugName,
        officialName: drug.officialName || drug.drugName,
        shortLabel: shortSubstance(drug.officialSubstance) || drug.officialName || drug.drugName,
      });
      // Un code ATC est un signal plus fort qu'une correspondance textuelle.
      matchStrength = Math.max(
        matchStrength,
        atcHit ? 1 : classHit ? 0.8 : 0.6,
      );
    }

    // Le besoin compris par l'IA. Il nomme les lignes qui le motivent ; à
    // défaut, tout le traitement. Il ne pèse pas plus qu'une classe : sa
    // force suit la confiance validée, jamais au-delà d'un code ATC.
    const need =
      rule.needTriggers && rule.needTriggers.length > 0
        ? (needs.find((candidate) => rule.needTriggers!.includes(candidate.key)) ?? null)
        : null;

    if (need && triggers.length === 0) {
      const cited = drugs.filter((drug) => need.lineIndexes.includes(drug.lineIndex));
      for (const drug of cited.length > 0 ? cited : drugs) {
        triggers.push({
          lineIndex: drug.lineIndex,
          drugName: drug.drugName,
          officialName: drug.officialName || drug.drugName,
          shortLabel: shortSubstance(drug.officialSubstance) || drug.officialName || drug.drugName,
        });
      }
      matchStrength = Math.max(matchStrength, 0.6 + 0.4 * need.confidence);
    }

    if (triggers.length === 0) continue;

    const blockReason = rule.blockedFor?.(patient) ?? null;
    const adjustment = rule.adjustPriority?.(patient) ?? 0;

    // La nature du conseil borne sa priorité : un conseil de sécurité ne peut
    // jamais descendre sous un conseil de confort, quelles que soient la force
    // de correspondance et les ajustements liés au contexte patient.
    const raw = Math.round(rule.basePriority * matchStrength + adjustment);
    const priority = Math.max(
      PRIORITY_FLOOR[rule.kind],
      Math.min(PRIORITY_CEILING[rule.kind], raw),
    );

    const variants: { suffix: string; tags: string[]; exclude: string[]; prefer: string[]; routine: AdviceOpportunityResult["routine"] }[] = rule.routine
      ? rule.routine.steps.map((step, index) => ({
          suffix: `:${step.key}`,
          tags: step.matchingTags,
          exclude: [...(rule.productExclude ?? []), ...(step.productExclude ?? [])],
          prefer: step.productPrefer ?? rule.productPrefer ?? [],
          routine: { key: rule.key, title: rule.routine!.title, stepKey: step.key, stepLabel: step.label, stepIndex: index, stepCount: rule.routine!.steps.length, benefit: step.benefit },
        }))
      : [{ suffix: "", tags: rule.matchingTags, exclude: rule.productExclude ?? [], prefer: rule.productPrefer ?? [], routine: null }];

    for (const variant of variants) byKey.set(rule.key + variant.suffix, {
      key: rule.key + variant.suffix,
      kind: rule.kind,
      category: rule.category,
      title: rule.title,
      benefits: rule.benefits ?? [],
      routine: variant.routine,
      // Le pharmacien lit la dénomination officielle : elle est vérifiable.
      rationale: rule.rationaleTemplate.replace(
        "{drug}",
        [...new Set(triggers.map((t) => t.officialName))].join(", "),
      ),
      shortReason: rule.shortReasonTemplate.replaceAll(
        "{drug}",
        [...new Set(triggers.map((t) => t.shortLabel))].join(", "),
      ),
      // `{product}` reste en attente : à ce stade le catalogue n'a pas encore
      // été consulté, et c'est précisément la garantie qu'on veut conserver.
      counterScriptTemplate: rule.counterScriptTemplate.replaceAll(
        "{drug}",
        [...new Set(triggers.map((t) => t.drugName))].join(", "),
      ),
      patientReasonTemplate: rule.patientReasonTemplate.replaceAll(
        "{drug}",
        [...new Set(triggers.map((t) => t.drugName))].join(", "),
      ),
      clinicalContext: rule.clinicalContext,
      safetyNotes: rule.safetyNotes,
      priority,
      isBlocked: blockReason !== null,
      blockReason,
      matchingTags: variant.tags,
      excludeTags: rule.excludeTags,
      productExclude: variant.exclude,
      productPrefer: variant.prefer,
      companion: rule.companion ?? null,
      triggeredBy: triggers.map((t) => ({ lineIndex: t.lineIndex, drugName: t.drugName })),
      ruleKey: rule.key,
      ruleVersion: rule.version,
      confirmedReason: rule.confirmedReasonTemplate ?? null,
      question: rule.question ?? null,
      requiresConfirmation: Boolean(rule.question),
      needKey: need?.key ?? null,
      aiJustification: need?.justification ?? null,
    });
  }

  return [...byKey.values()].sort((a, b) => b.priority - a.priority);
}
