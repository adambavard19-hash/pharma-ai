/**
 * Les vigilances patient affichées sur les cartes de conseil.
 *
 * Une population (grossesse, allaitement…) et un niveau. Le niveau ne se
 * déduit jamais de la population : une même population peut appeler une simple
 * information pour un produit et une contre-indication pour un autre. La liste
 * est extensible : une nouvelle population = une ligne ici ; son icône est
 * choisie à l'affichage.
 *
 * Aucune règle médicale n'est écrite dans ce fichier : il ne fait que nommer.
 * Les règles vivent dans le moteur (règles de conseil sourcées) ou sont
 * déclarées par le pharmacien sur ses produits.
 */

export const VIGILANCE_POPULATIONS = [
  { key: "PREGNANCY", label: "Grossesse", question: "Grossesse en cours ?" },
  { key: "BREASTFEEDING", label: "Allaitement", question: "Allaitement en cours ?" },
  { key: "ASTHMA", label: "Asthme", question: "Asthme ?" },
  { key: "EPILEPSY", label: "Épilepsie", question: "Épilepsie ou antécédent de convulsions ?" },
  { key: "CHILD", label: "Enfant", question: "Pour un enfant ?" },
] as const;

export type VigilancePopulation = (typeof VIGILANCE_POPULATIONS)[number]["key"];

export const VIGILANCE_LEVELS = ["INFO", "CAUTION", "PHARMACIST_VALIDATION", "CONTRAINDICATION"] as const;
export type VigilanceLevel = (typeof VIGILANCE_LEVELS)[number];

export const VIGILANCE_LEVEL_LABELS: Record<VigilanceLevel, string> = {
  INFO: "Information",
  CAUTION: "Prudence",
  PHARMACIST_VALIDATION: "Validation pharmacien",
  CONTRAINDICATION: "Contre-indication",
};

/** Ordre de gravité, pour trier et garder la plus forte d'une population. */
export const VIGILANCE_LEVEL_RANK: Record<VigilanceLevel, number> = {
  INFO: 0,
  CAUTION: 1,
  PHARMACIST_VALIDATION: 2,
  CONTRAINDICATION: 3,
};

const BY_KEY = new Map<string, (typeof VIGILANCE_POPULATIONS)[number]>(VIGILANCE_POPULATIONS.map((p) => [p.key, p]));

export function populationLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function isVigilancePopulation(key: string): key is VigilancePopulation {
  return BY_KEY.has(key);
}

/**
 * Une vigilance telle qu'elle voyage du moteur à la carte, puis en base
 * (`Recommendation.vigilances`). `status` dit ce qu'on sait du patient :
 * concerné, non concerné, ou inconnu (mode sans patient : à vérifier).
 */
export type SuggestionVigilance = {
  population: string;
  level: VigilanceLevel;
  /** Le patient est concerné (true), ne l'est pas (false), ou on ne le sait pas (null). */
  status: boolean | null;
  /** La raison, lisible par le pharmacien : ce que dit la règle ou la fiche produit. */
  text: string;
  /** D'où vient la vigilance : règle de conseil sourcée, fiche produit de l'officine. */
  origin: "RULE" | "PRODUCT";
  /** Les sources citées par la règle (jamais inventées). */
  sources: string[];
};

/** Relit des vigilances persistées (Json) sans leur faire confiance. */
export function parseSuggestionVigilances(value: unknown): SuggestionVigilance[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const v = item as Record<string, unknown>;
    if (typeof v.population !== "string" || !VIGILANCE_LEVELS.includes(v.level as VigilanceLevel)) return [];
    return [{
      population: v.population,
      level: v.level as VigilanceLevel,
      status: v.status === true ? true : v.status === false ? false : null,
      text: typeof v.text === "string" ? v.text : "",
      origin: v.origin === "PRODUCT" ? "PRODUCT" : "RULE",
      sources: Array.isArray(v.sources) ? v.sources.filter((x): x is string => typeof x === "string") : [],
    } satisfies SuggestionVigilance];
  });
}
