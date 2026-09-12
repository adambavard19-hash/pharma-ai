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
    title: "Hygiène nasale en contexte ORL",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["NASAL_CONGESTION"],
    question: "Le patient a-t-il aussi le nez bouché ou qui coule ?",
    category: "SOINS",
    atcPrefixes: [],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 62,
    matchingTags: ["nez", "nasal", "lavage", "eau de mer", "orl", "spray nasal"],
    // « Lavage » est un mot partagé : un collyre ou un produit auriculaire ne
    // lave pas le nez. Écartés par leur nom.
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
    title: "Yeux irrités en contexte allergique",
    kind: "COMFORT",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    needTriggers: ["ALLERGIC_EYE_IRRITATION"],
    question: "Les yeux du patient piquent-ils ou pleurent-ils ?",
    category: "SOINS",
    atcPrefixes: [],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 52,
    matchingTags: ["yeux", "oculaire", "collyre", "lavage", "larmes"],
    // Une irritation allergique se lave et s'hydrate ; elle ne se traite pas
    // avec un collyre antiseptique ou antibiotique, qui ont d'autres
    // indications et sont écartés par leur nom.
    productExclude: [String.raw`nasal`, String.raw`\bnez\b`, String.raw`rhino`, String.raw`desomedine`, String.raw`hexamidine`, String.raw`antiseptique`, String.raw`antibio`, String.raw`tobramycine`, String.raw`tobrex`, String.raw`rifamycine`, String.raw`azyter`, String.raw`chloramphenicol`, String.raw`ofloxacine`, String.raw`ciprofloxacine`, String.raw`dexamethasone`, String.raw`cortico`],
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
    key: "mouth-rinse-inhaled-corticosteroid",
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
function shortSubstance(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim() || null;
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

    byKey.set(rule.key, {
      key: rule.key,
      kind: rule.kind,
      category: rule.category,
      title: rule.title,
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
      matchingTags: rule.matchingTags,
      excludeTags: rule.excludeTags,
      productExclude: rule.productExclude ?? [],
      productPrefer: rule.productPrefer ?? [],
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
