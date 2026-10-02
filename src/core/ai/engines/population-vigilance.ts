import type { CatalogProduct, PatientContext } from "../types";
import {
  VIGILANCE_LEVEL_RANK,
  populationLabel,
  type SuggestionVigilance,
  type VigilanceLevel,
  type VigilancePopulation,
} from "../../../config/vigilances";

/**
 * Vigilances patient (grossesse, allaitement, asthme, épilepsie, enfant…) sur
 * une proposition de conseil.
 *
 * Deux sources seulement, et aucune n'est inventée ici :
 * - les règles de conseil, qui écrivent leurs populations à partir de leurs
 *   sources (ANSM pour les huiles essentielles, par exemple) ;
 * - la fiche produit de l'officine : contre-indications saisies et
 *   vigilances déclarées par le pharmacien.
 *
 * Le niveau est porté par la source, jamais déduit de la population. Ce
 * module dit seulement si le patient est concerné (oui, non, inconnu) et ce
 * qu'il faut afficher. Une vigilance n'est jamais transformée en
 * contre-indication ; l'inverse non plus, sauf une : une contre-indication
 * dont on ne sait pas si elle concerne le patient (mode sans patient) devient
 * « validation pharmacien » — on ne peut ni la taire ni bloquer à l'aveugle.
 */

export type PopulationVigilanceRule = {
  population: VigilancePopulation;
  level: VigilanceLevel;
  /** Le texte de la source, tel quel. */
  text: string;
  sources: string[];
  /** Pour CHILD : âge (en années) sous lequel le patient est concerné. */
  maxAgeYears?: number;
};

const CONDITION_PATTERNS: Partial<Record<VigilancePopulation, RegExp>> = {
  ASTHMA: /asthm/i,
  EPILEPSY: /epilep|épilep|convuls/i,
};

/** L'âge d'un enfant au sens d'une vigilance sans seuil écrit : moins de 12 ans. */
const DEFAULT_CHILD_AGE = 12;

/**
 * Le patient est-il concerné ? `null` : on ne le sait pas (aucun patient
 * rattaché, ou l'information n'est pas renseignée).
 */
export function patientStatus(population: string, patient: PatientContext, maxAgeYears?: number): boolean | null {
  switch (population) {
    case "PREGNANCY":
      return patient.isPregnant;
    case "BREASTFEEDING":
      return patient.isBreastfeeding;
    case "CHILD":
      return patient.ageYears === null ? null : patient.ageYears < (maxAgeYears ?? DEFAULT_CHILD_AGE);
    default: {
      const pattern = CONDITION_PATTERNS[population as VigilancePopulation];
      if (!pattern) return null;
      if (patient.chronicConditions.some((c) => pattern.test(c))) return true;
      // Une pathologie absente d'une liste n'est pas une pathologie écartée :
      // tant qu'on ne l'a pas demandée, on ne sait pas.
      return null;
    }
  }
}

const PRODUCT_CONTRAINDICATION_WORDS: { population: VigilancePopulation; pattern: RegExp }[] = [
  { population: "PREGNANCY", pattern: /grossesse|enceinte/i },
  { population: "BREASTFEEDING", pattern: /allaitement/i },
  { population: "CHILD", pattern: /enfant/i },
  { population: "ASTHMA", pattern: /asthm/i },
  { population: "EPILEPSY", pattern: /epilep|épilep|convuls/i },
];

/** Les vigilances qu'une fiche produit porte : contre-indications saisies, vigilances déclarées. */
export function productPopulationRules(product: Pick<CatalogProduct, "contraindications" | "vigilances">): (PopulationVigilanceRule & { origin: "PRODUCT" })[] {
  const out: (PopulationVigilanceRule & { origin: "PRODUCT" })[] = [];
  for (const contraindication of product.contraindications) {
    for (const { population, pattern } of PRODUCT_CONTRAINDICATION_WORDS) {
      if (pattern.test(contraindication)) {
        out.push({ population, level: "CONTRAINDICATION", text: `Fiche produit : ${contraindication}`, sources: ["Fiche produit de l'officine"], origin: "PRODUCT" });
      }
    }
  }
  for (const declared of product.vigilances ?? []) {
    out.push({
      population: declared.population as VigilancePopulation,
      level: declared.level,
      text: declared.note?.trim() ? declared.note.trim() : `${populationLabel(declared.population)} : vigilance déclarée par la pharmacie.`,
      sources: ["Déclaré par la pharmacie"],
      origin: "PRODUCT",
    });
  }
  return out;
}

/**
 * Le produit est-il contre-indiqué pour ce patient d'après les vigilances que
 * l'officine a déclarées ? (Les contre-indications saisies en texte sont déjà
 * traitées par evaluateProductSafety.)
 */
export function declaredContraindicationFor(product: Pick<CatalogProduct, "vigilances">, patient: PatientContext): string | null {
  for (const declared of product.vigilances ?? []) {
    if (declared.level !== "CONTRAINDICATION") continue;
    if (patientStatus(declared.population, patient) === true) return populationLabel(declared.population);
  }
  return null;
}

/**
 * Ce que la carte affiche. Une vigilance sur une population dont le patient
 * ne fait pas partie disparaît. Une population inconnue n'apparaît que si la
 * source demande au moins une validation pharmacien : une simple information
 * ou une prudence sur un patient qu'on ne connaît pas ne fait que charger
 * l'écran.
 */
export function suggestionVigilances(
  ruleRules: PopulationVigilanceRule[],
  product: Pick<CatalogProduct, "contraindications" | "vigilances">,
  patient: PatientContext,
): SuggestionVigilance[] {
  const candidates = [
    ...ruleRules.map((rule) => ({ ...rule, origin: "RULE" as const })),
    ...productPopulationRules(product),
  ];
  const byPopulation = new Map<string, SuggestionVigilance>();
  for (const rule of candidates) {
    const status = patientStatus(rule.population, patient, rule.maxAgeYears);
    if (status === false) continue;
    let level = rule.level;
    if (status === null) {
      if (VIGILANCE_LEVEL_RANK[level] < VIGILANCE_LEVEL_RANK.PHARMACIST_VALIDATION) continue;
      level = "PHARMACIST_VALIDATION";
    }
    const vigilance: SuggestionVigilance = { population: rule.population, level, status, text: rule.text, origin: rule.origin, sources: rule.sources };
    const previous = byPopulation.get(rule.population);
    if (!previous || VIGILANCE_LEVEL_RANK[level] > VIGILANCE_LEVEL_RANK[previous.level]) {
      byPopulation.set(rule.population, previous ? { ...vigilance, sources: [...new Set([...vigilance.sources, ...previous.sources])] } : vigilance);
    } else {
      previous.sources = [...new Set([...previous.sources, ...vigilance.sources])];
    }
  }
  return [...byPopulation.values()].sort((a, b) => VIGILANCE_LEVEL_RANK[b.level] - VIGILANCE_LEVEL_RANK[a.level]);
}

/** Une proposition qui demande la validation d'un pharmacien avant d'être acceptée. */
export function requiresPharmacistValidation(vigilances: SuggestionVigilance[] | null | undefined): boolean {
  return (vigilances ?? []).some((v) => v.level === "PHARMACIST_VALIDATION" || v.level === "CONTRAINDICATION");
}
