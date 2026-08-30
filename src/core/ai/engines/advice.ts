import type {
  AdviceOpportunityResult,
  DrugKnowledge,
  PatientContext,
  ProductCategoryCode,
} from "../types";

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

export type AdviceRule = {
  key: string;
  title: string;
  kind: AdviceKind;
  triggerMode: AdviceTriggerMode;
  category: ProductCategoryCode;
  /** Préfixes de code ATC déclenchant la règle. */
  atcPrefixes: string[];
  /** Classes thérapeutiques (libellés du référentiel) déclenchant la règle. */
  therapeuticClasses: string[];
  /** Effets indésirables fréquents qui rendent le conseil pertinent. */
  sideEffectTriggers: string[];
  /** Priorité clinique de base, 0 → 100. Indépendante de toute marge. */
  basePriority: number;
  matchingTags: string[];
  excludeTags: string[];
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
    triggerMode: "CLASS_ONLY",
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
      "« {drug} est un antibiotique : la flore intestinale peut être perturbée pendant la cure. Si vous souhaitez l'accompagner, {product} se prend à distance de l'antibiotique, sur toute la durée du traitement. »",
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
    triggerMode: "CLASS_ONLY",
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
      "« {drug} est un anti-inflammatoire : prenez-le au milieu d'un repas, jamais à jeun. En cas de gêne, {product} peut aider au confort — cela ne remplace pas un protecteur gastrique prescrit, et une douleur qui dure doit être signalée à votre médecin. »",
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
    triggerMode: "CLASS_ONLY",
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
    clinicalContext:
      "Privilégier une formule sans parfum sur peau lésée. Application à distance du traitement actif.",
    safetyNotes: ["Ne pas appliquer sur une plaie ouverte sans avis."],
  },
  {
    key: "magnesium-fatigue",
    title: "Fatigue et tension musculaire",
    kind: "COMFORT",
    triggerMode: "CLASS_OR_SIDE_EFFECT",
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
      "« Ressentez-vous de la fatigue ou des crampes en ce moment ? Si c'est le cas, {product} peut être envisagé ; sinon ce n'est pas utile. »",
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
    triggerMode: "CLASS_ONLY",
    category: "VITAMINES",
    atcPrefixes: ["M05B", "H05"],
    therapeuticClasses: ["Traitement de l'ostéoporose", "Corticoïde"],
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
    triggerMode: "CLASS_OR_SIDE_EFFECT",
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
      "« Avez-vous la bouche sèche depuis le début du traitement ? C'est un effet fréquent. {product} aide au confort au quotidien, en complément d'un brossage régulier. »",
    clinicalContext: "Conseil de confort ; à évoquer si le patient rapporte la gêne.",
    safetyNotes: [],
  },
  {
    key: "iron-absorption-support",
    title: "Tolérance d'une supplémentation martiale",
    kind: "TOLERANCE",
    triggerMode: "CLASS_ONLY",
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
    clinicalContext:
      "Rappeler la prise à distance du thé et du café, qui réduisent l'absorption du fer.",
    safetyNotes: ["Orienter vers le médecin en cas de douleurs abdominales."],
  },
  {
    key: "sun-photosensitivity",
    title: "Photosensibilisation",
    kind: "SAFETY",
    triggerMode: "CLASS_OR_SIDE_EFFECT",
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
    clinicalContext:
      "Conseil prioritaire en période ensoleillée et pour toute exposition professionnelle.",
    safetyNotes: ["Rappeler d'éviter l'exposition directe pendant le traitement."],
  },
];

const norm = (value: string) => value.toLowerCase().trim();

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
}): AdviceOpportunityResult[] {
  const { drugs, patient } = params;
  const byKey = new Map<string, AdviceOpportunityResult>();

  for (const rule of ADVICE_RULES) {
    const triggers: { lineIndex: number; drugName: string; shortLabel: string }[] = [];
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
        drugName: drug.officialName || drug.drugName,
        shortLabel: drug.officialSubstance || drug.officialName || drug.drugName,
      });
      // Un code ATC est un signal plus fort qu'une correspondance textuelle.
      matchStrength = Math.max(
        matchStrength,
        atcHit ? 1 : classHit ? 0.8 : 0.6,
      );
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
      rationale: rule.rationaleTemplate.replace(
        "{drug}",
        triggers.map((t) => t.drugName).join(", "),
      ),
      shortReason: rule.shortReasonTemplate.replaceAll(
        "{drug}",
        [...new Set(triggers.map((t) => t.shortLabel))].join(", "),
      ),
      // `{product}` reste en attente : à ce stade le catalogue n'a pas encore
      // été consulté, et c'est précisément la garantie qu'on veut conserver.
      counterScriptTemplate: rule.counterScriptTemplate.replaceAll(
        "{drug}",
        triggers.map((t) => t.drugName).join(", "),
      ),
      clinicalContext: rule.clinicalContext,
      safetyNotes: rule.safetyNotes,
      priority,
      isBlocked: blockReason !== null,
      blockReason,
      matchingTags: rule.matchingTags,
      excludeTags: rule.excludeTags,
      triggeredBy: triggers,
    });
  }

  return [...byKey.values()].sort((a, b) => b.priority - a.priority);
}
