/**
 * La taxonomie des besoins complémentaires.
 *
 * C'est la frontière entre ce que l'IA comprend et ce que les règles décident.
 * Le modèle ne peut désigner un besoin QUE parmi ces clés : une clé inconnue
 * est écartée à la validation, sans exception. La question posée au patient
 * est écrite ici — relue, versionnée — jamais formulée à la volée.
 *
 * Chaque besoin est ensuite rapproché des règles de conseil
 * (`src/core/ai/engines/advice.ts`, champ `needTriggers`). Un besoin sans règle
 * ne produit rien : comprendre n'est pas conseiller.
 *
 * ⚠️ Comme les règles de conseil, cette liste doit être validée par un
 * pharmacien avant usage réel (docs/CONFORMITE.md § 3.2).
 */

export const NEED_KEYS = [
  "NASAL_CONGESTION",
  "SORE_THROAT",
  "COUGH_COMFORT",
  "FEVER_MONITORING",
  "REHYDRATION",
  "ALLERGIC_EYE_IRRITATION",
  "ANTIBIOTIC_DIGESTIVE_TOLERANCE",
  "DRY_MOUTH",
  "FATIGUE_CRAMPS",
  "PHOTOSENSITIVITY",
  "SKIN_DRYNESS",
  "GASTRIC_DISCOMFORT",
  "CONSTIPATION",
] as const;

export type NeedKey = (typeof NEED_KEYS)[number];

export type NeedDefinition = {
  key: NeedKey;
  /** Libellé court, pour le pharmacien. */
  label: string;
  /**
   * Ce que le modèle doit comprendre par cette clé. C'est la seule description
   * qu'il reçoit : elle dit quand le besoin est plausible, et quand il ne
   * l'est pas.
   */
  description: string;
};

export const NEED_DEFINITIONS: Record<NeedKey, NeedDefinition> = {
  NASAL_CONGESTION: {
    key: "NASAL_CONGESTION",
    label: "Nez bouché ou qui coule",
    description:
      "Contexte ORL, rhinite ou infection des voies respiratoires hautes où une gêne nasale est plausible et où l'ordonnance ne prévoit rien pour le nez.",
  },
  SORE_THROAT: {
    key: "SORE_THROAT",
    label: "Gorge irritée",
    description:
      "Contexte ORL ou respiratoire (angine, pharyngite, toux) où une irritation de la gorge est plausible et non traitée par l'ordonnance.",
  },
  COUGH_COMFORT: {
    key: "COUGH_COMFORT",
    label: "Toux irritante",
    description:
      "Toux plausible dans le contexte, SANS antitussif ni traitement de la toux déjà prescrit. Ne pas identifier si l'ordonnance traite déjà la toux.",
  },
  FEVER_MONITORING: {
    key: "FEVER_MONITORING",
    label: "Surveillance de la température",
    description:
      "Contexte infectieux ou fébrile (antibiotique, antipyrétique) où la température doit être suivie à domicile, surtout pour un enfant ou une personne fragile.",
  },
  REHYDRATION: {
    key: "REHYDRATION",
    label: "Réhydratation",
    description:
      "Diarrhée, vomissements ou fièvre importante plausibles, en particulier chez l'enfant ou la personne âgée.",
  },
  ALLERGIC_EYE_IRRITATION: {
    key: "ALLERGIC_EYE_IRRITATION",
    label: "Yeux irrités",
    description:
      "Contexte allergique (antihistaminique, rhinite allergique) où une irritation oculaire est plausible et non traitée.",
  },
  ANTIBIOTIC_DIGESTIVE_TOLERANCE: {
    key: "ANTIBIOTIC_DIGESTIVE_TOLERANCE",
    label: "Tolérance digestive sous antibiotique",
    description:
      "Antibiothérapie par voie orale susceptible de perturber la flore intestinale.",
  },
  DRY_MOUTH: {
    key: "DRY_MOUTH",
    label: "Bouche sèche",
    description:
      "Traitement dont la sécheresse buccale est un effet fréquent et documenté (antihistaminique sédatif, antidépresseur, neuroleptique, anticholinergique).",
  },
  FATIGUE_CRAMPS: {
    key: "FATIGUE_CRAMPS",
    label: "Fatigue ou crampes",
    description:
      "Contexte où une fatigue ou des crampes sont fréquemment rapportées (anxiolytique, antidépresseur, convalescence longue).",
  },
  PHOTOSENSITIVITY: {
    key: "PHOTOSENSITIVITY",
    label: "Photosensibilisation",
    description:
      "Médicament photosensibilisant documenté (cyclines, certains diurétiques, quinolones, certains anti-inflammatoires locaux).",
  },
  SKIN_DRYNESS: {
    key: "SKIN_DRYNESS",
    label: "Sécheresse cutanée",
    description:
      "Traitement dermatologique local ou systémique dont la sécheresse cutanée est un effet fréquent (rétinoïdes, dermocorticoïdes, peroxyde de benzoyle).",
  },
  GASTRIC_DISCOMFORT: {
    key: "GASTRIC_DISCOMFORT",
    label: "Inconfort gastrique",
    description:
      "Anti-inflammatoire non stéroïdien ou corticoïde par voie orale, sans protection gastrique prescrite.",
  },
  CONSTIPATION: {
    key: "CONSTIPATION",
    label: "Transit ralenti",
    description:
      "Traitement dont la constipation est un effet fréquent (fer, opioïdes, certains antispasmodiques), sans laxatif prescrit.",
  },
};

export function isNeedKey(value: string): value is NeedKey {
  return (NEED_KEYS as readonly string[]).includes(value);
}
