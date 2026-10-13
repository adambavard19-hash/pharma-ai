/**
 * Les formes et limites d'une modification de conseil, sans aucune dépendance : l'écran de la console les lit côté navigateur
 * sans embarquer le moteur de règles. Voir `central-advice-edit.ts`.
 */

/** Les personnes pour qui la console écarte le conseil, EN PLUS des exclusions écrites dans le code. */
export type RuleExclusions = {
  /** Âge minimum en années (vide : aucun). Un âge inconnu n'écarte pas. */
  minAgeYears: number | null;
  pregnancy: boolean;
  breastfeeding: boolean;
  /** D'autres situations déclarées (« asthme », « allergie aux huiles essentielles ») : un mot suffit. */
  conditions: string[];
};

export const NO_EXCLUSIONS: RuleExclusions = { minAgeYears: null, pregnancy: false, breastfeeding: false, conditions: [] };

/** Ce qui se modifie d'un conseil, avec les mots de la console. `{drug}` et `{product}` restent remplacés par le moteur. */
export type RuleEditValues = {
  title: string;
  /** Ce que dit le pharmacien au comptoir. */
  counterScript: string;
  /** La phrase que lit le patient. */
  patientReason: string;
  /** La raison affichée au pharmacien, en une ligne. */
  shortReason: string;
  /** La question à poser avant de proposer (oui / non). Vide : aucune. */
  question: string | null;
  atcPrefixes: string[];
  therapeuticClasses: string[];
  /** Le type de produit à proposer. */
  category: string;
  /** Les mots qui décrivent le BESOIN (étiquettes du vocabulaire fermé). */
  matchingTags: string[];
  /** Des mots qui font passer une référence devant ses équivalentes (une marque, « sans alcool ») : des préférences, jamais une obligation. */
  preferWords: string[];
  exclusions: RuleExclusions;
  /** 1 → 100 : le rang du conseil quand plusieurs se présentent. */
  priority: number;
  safetyNotes: string[];
  source: string | null;
};

export const EDIT_FIELD_LABELS: Record<keyof RuleEditValues, string> = {
  title: "Nom du conseil",
  counterScript: "Ce que dit le pharmacien",
  patientReason: "Phrase pour le patient",
  shortReason: "Raison affichée",
  question: "Question à poser avant",
  atcPrefixes: "Familles de médicaments qui le déclenchent",
  therapeuticClasses: "Classes qui le déclenchent",
  category: "Type de produit à proposer",
  matchingTags: "Ce qu'il faut proposer (besoin)",
  preferWords: "Préférences",
  exclusions: "Personnes exclues",
  priority: "Priorité",
  safetyNotes: "Précautions",
  source: "Source",
};

export const EDIT_LIMITS = { title: 80, script: 420, reason: 160, question: 300, source: 1200, note: 300, notes: 8, atc: 16, classes: 8, tags: 8, preferWords: 10, preferWord: 40, conditions: 10 } as const;
