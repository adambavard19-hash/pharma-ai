import type {
  AdviceOpportunityResult,
  CatalogProduct,
  DrugKnowledge,
  ExtractedPrescriptionLine,
  OfficialDrugFacts,
  PatientContext,
  SafetyFindingResult,
} from "../types";
import { OCR_REVIEW_THRESHOLD } from "@/config/constants";

/**
 * Moteur de sécurité — PREMIÈRE étape du pipeline, avant toute considération
 * de pertinence et a fortiori de marge.
 *
 * Son rôle n'est pas de « valider » une ordonnance : c'est l'acte du
 * pharmacien. Son rôle est de faire remonter tout ce qui exige un regard
 * humain, et de BLOQUER ce qui ne peut pas être proposé en confiance.
 *
 * Principe directeur : en cas de doute, on signale. Une information absente
 * n'est jamais comblée par une hypothèse.
 */

export type SafetyEvaluation = {
  findings: SafetyFindingResult[];
  /** Clés d'opportunités à écarter définitivement. */
  blockedOpportunityKeys: Set<string>;
  /** Identifiants produits écartés pour raison de sécurité. */
  blockedProductIds: Set<string>;
  /** `true` si l'analyse ne peut pas aboutir en l'état. */
  halted: boolean;
  haltReasons: string[];
};

const SOURCE = "safety-engine@1.0.0";

/**
 * Contrôle de l'extraction : tout champ incertain ou illisible impose une
 * vérification humaine explicite.
 */
export function evaluateExtractionSafety(
  lines: ExtractedPrescriptionLine[],
): SafetyFindingResult[] {
  const findings: SafetyFindingResult[] = [];

  if (lines.length === 0) {
    findings.push({
      severity: "BLOCKING",
      code: "EXTRACTION_EMPTY",
      message:
        "Aucune ligne n'a pu être extraite de l'ordonnance. Saisie manuelle nécessaire.",
      subjectType: "ANALYSIS",
      subjectId: null,
      source: SOURCE,
    });
    return findings;
  }

  lines.forEach((line, index) => {
    const label = line.drugName.value ?? `ligne ${index + 1}`;

    if (line.drugName.unreadable || !line.drugName.value) {
      findings.push({
        severity: "BLOCKING",
        code: "DRUG_NAME_UNREADABLE",
        message: `Ligne ${index + 1} : le nom du médicament n'a pas pu être lu. Il doit être saisi par un professionnel avant toute analyse.`,
        subjectType: "PRESCRIPTION_LINE",
        subjectId: String(index),
        source: SOURCE,
      });
      return;
    }

    if (line.drugName.confidence < OCR_REVIEW_THRESHOLD) {
      findings.push({
        severity: "WARNING",
        code: "DRUG_NAME_LOW_CONFIDENCE",
        message: `« ${label} » a été lu avec une confiance de ${Math.round(line.drugName.confidence * 100)} %. À confirmer.`,
        subjectType: "PRESCRIPTION_LINE",
        subjectId: String(index),
        source: SOURCE,
      });
    }

    for (const [field, fieldLabel] of [
      ["dosage", "dosage"],
      ["posology", "posologie"],
      ["form", "forme"],
    ] as const) {
      const extracted = line[field];
      if (extracted.unreadable) {
        findings.push({
          severity: "CAUTION",
          code: `${field.toUpperCase()}_UNREADABLE`,
          message: `« ${label} » : ${fieldLabel} illisible. Le champ reste vide, aucune valeur n'a été supposée.`,
          subjectType: "PRESCRIPTION_LINE",
          subjectId: String(index),
          source: SOURCE,
        });
      } else if (extracted.value && extracted.confidence < OCR_REVIEW_THRESHOLD) {
        findings.push({
          severity: "CAUTION",
          code: `${field.toUpperCase()}_LOW_CONFIDENCE`,
          message: `« ${label} » : ${fieldLabel} à confirmer (confiance ${Math.round(extracted.confidence * 100)} %).`,
          subjectType: "PRESCRIPTION_LINE",
          subjectId: String(index),
          source: SOURCE,
        });
      }
    }
  });

  return findings;
}

/**
 * Contrôle du contexte : un médicament absent du référentiel ne peut pas
 * donner lieu à une explication ni servir de déclencheur de conseil.
 */
export function evaluateKnowledgeCoverage(
  lines: { drugName: string | null }[],
  knowledge: Map<string, DrugKnowledge | null>,
  official?: Map<string, OfficialDrugFacts | null>,
  options?: {
    /**
     * Vrai lorsqu'un référentiel d'interactions a réellement été confronté à
     * l'ordonnance. L'avertissement ligne à ligne ci-dessous n'a alors plus
     * lieu d'être : la phrase de couverture le dit une fois, et mieux.
     */
    interactionsCovered?: boolean;
  },
): SafetyFindingResult[] {
  const findings: SafetyFindingResult[] = [];

  lines.forEach((line, index) => {
    if (!line.drugName) return;
    const key = line.drugName.toLowerCase();
    const facts = official?.get(key) ?? null;
    const advisory = knowledge.get(key) ?? null;
    const subjectId = String(index);

    if (!facts && !advisory) {
      findings.push({
        severity: "WARNING",
        code: "DRUG_NOT_IN_REFERENTIAL",
        message: `« ${line.drugName} » est absent du référentiel médicamenteux connecté. Aucune explication automatique n'est produite pour ce médicament.`,
        subjectType: "PRESCRIPTION_LINE",
        subjectId,
        source: SOURCE,
      });
      return;
    }

    if (!facts) {
      findings.push({
        severity: "INFO",
        code: "DRUG_NOT_IDENTIFIED",
        message: `« ${line.drugName} » n'est pas rattaché au catalogue national : ni sa composition ni ses conditions de délivrance ne sont vérifiées.`,
        subjectType: "PRESCRIPTION_LINE",
        subjectId,
        source: SOURCE,
      });
    }

    // Le point qui compte le plus de tout ce fichier. Le catalogue national dit
    // ce qu'est un médicament ; il ne dit RIEN de ses interactions. Une ligne
    // parfaitement identifiée mais dépourvue de données d'interaction produit
    // donc une analyse silencieuse — et un écran sans alerte se lit
    // « rien à signaler », ce qui serait faux. On le dit explicitement.
    // Une liste d'interactions vide ne dit PAS « aucune interaction connue » :
    // elle dit « rien n'a été renseigné ». La couche éditoriale ne distingue
    // pas les deux, et inventer cette distinction serait fabriquer une donnée.
    // On le signale donc tel quel, plutôt que de laisser un écran muet passer
    // pour une vérification.
    const declaresInteractions = advisory !== null && advisory.interactionClasses.length > 0;

    if (facts && !declaresInteractions && !options?.interactionsCovered) {
      findings.push({
        severity: "WARNING",
        code: "DRUG_NO_INTERACTION_DATA",
        message: `« ${facts.name} » est bien identifié, mais aucune interaction n'est renseignée pour ce médicament : impossible de distinguer « aucune interaction connue » de « donnée absente ». L'absence d'alerte ne vaut pas absence de risque.`,
        subjectType: "PRESCRIPTION_LINE",
        subjectId,
        source: SOURCE,
      });
    }

    if (advisory?.isDemoData) {
      findings.push({
        severity: "INFO",
        code: "DEMO_REFERENTIAL",
        message: `Les informations sur « ${line.drugName} » proviennent du jeu de démonstration fictif, non d'une base médicamenteuse validée.`,
        subjectType: "PRESCRIPTION_LINE",
        subjectId,
        source: SOURCE,
      });
    }
  });

  return findings;
}

/**
 * Contrôle des opportunités de conseil au regard du contexte patient.
 * Une opportunité contre-indiquée est BLOQUÉE — pas rétrogradée.
 */
export function evaluateOpportunitySafety(
  opportunities: AdviceOpportunityResult[],
  patient: PatientContext,
  drugs: DrugKnowledge[],
): SafetyEvaluation {
  const findings: SafetyFindingResult[] = [];
  const blockedOpportunityKeys = new Set<string>();

  const interactionClasses = new Set(
    drugs.flatMap((d) => d.interactionClasses.map((c) => c.toLowerCase())),
  );

  for (const opportunity of opportunities) {
    if (opportunity.isBlocked) {
      blockedOpportunityKeys.add(opportunity.key);
      continue;
    }

    // Grossesse / allaitement : vigilance renforcée sur les compléments.
    if (
      (patient.isPregnant || patient.isBreastfeeding) &&
      ["PHYTOTHERAPIE", "VITAMINES", "MINERAUX", "NUTRITION"].includes(
        opportunity.category,
      )
    ) {
      findings.push({
        severity: "WARNING",
        code: "PREGNANCY_CAUTION",
        message: `Conseil « ${opportunity.title} » : contexte grossesse/allaitement déclaré. La pertinence doit être confirmée par le pharmacien avant toute proposition.`,
        subjectType: "OPPORTUNITY",
        subjectId: opportunity.key,
        source: SOURCE,
      });
    }

    // Interaction documentée entre la classe conseillée et le traitement.
    const conflicting = opportunity.matchingTags.filter((tag) =>
      interactionClasses.has(tag.toLowerCase()),
    );
    if (conflicting.length > 0) {
      blockedOpportunityKeys.add(opportunity.key);
      findings.push({
        severity: "BLOCKING",
        code: "DOCUMENTED_INTERACTION",
        message: `Conseil « ${opportunity.title} » écarté : interaction documentée avec le traitement (${conflicting.join(", ")}).`,
        subjectType: "OPPORTUNITY",
        subjectId: opportunity.key,
        source: SOURCE,
      });
    }

    // Insuffisance rénale/hépatique : les apports minéraux exigent un avis.
    if (
      patient.renalImpairment &&
      ["MINERAUX", "MAGNESIUM"].includes(opportunity.category)
    ) {
      blockedOpportunityKeys.add(opportunity.key);
      findings.push({
        severity: "BLOCKING",
        code: "RENAL_IMPAIRMENT",
        message: `Conseil « ${opportunity.title} » écarté : insuffisance rénale déclarée, un apport minéral relève d'un avis médical.`,
        subjectType: "OPPORTUNITY",
        subjectId: opportunity.key,
        source: SOURCE,
      });
    }
  }

  return {
    findings,
    blockedOpportunityKeys,
    blockedProductIds: new Set(),
    halted: false,
    haltReasons: [],
  };
}

/**
 * Contrôle produit : allergies déclarées, contre-indications déclarées par
 * l'officine, produit inactif. Un produit écarté ici ne peut être rattrapé par
 * aucune étape ultérieure.
 */
export function evaluateProductSafety(
  products: CatalogProduct[],
  patient: PatientContext,
  /** Substances actives déjà présentes sur l'ordonnance, telles que publiées. */
  prescribedSubstances: string[] = [],
): { findings: SafetyFindingResult[]; blockedProductIds: Set<string> } {
  const findings: SafetyFindingResult[] = [];
  const blockedProductIds = new Set<string>();

  const normalizedAllergies = patient.allergies.map((a) => a.trim().toLowerCase()).filter(Boolean);
  const prescribed = new Set(
    prescribedSubstances.map((substance) => substance.trim().toLowerCase()).filter(Boolean),
  );

  for (const product of products) {
    if (!product.isActive) {
      blockedProductIds.add(product.id);
      continue;
    }

    // Un médicament soumis à prescription ne se propose pas en vente
    // additionnelle. Le filtre existe déjà au chargement du catalogue ; il est
    // répété ici parce qu'une règle de cette portée ne doit pas dépendre d'un
    // seul endroit du code.
    if (product.prescriptionConditions.length > 0) {
      blockedProductIds.add(product.id);
      findings.push({
        severity: "BLOCKING",
        code: "PRESCRIPTION_REQUIRED",
        message: `« ${product.name} » écarté : soumis à prescription (${product.prescriptionConditions.join(", ")}). Un médicament de liste ne se propose pas en conseil.`,
        subjectType: "PRODUCT",
        subjectId: product.id,
        source: SOURCE,
      });
      continue;
    }

    // Proposer une substance déjà prescrite, c'est risquer un doublement de
    // dose sans que personne ne l'ait décidé.
    const duplicated = product.substances.find((substance) =>
      prescribed.has(substance.trim().toLowerCase()),
    );
    if (duplicated) {
      blockedProductIds.add(product.id);
      findings.push({
        severity: "BLOCKING",
        code: "SUBSTANCE_ALREADY_PRESCRIBED",
        message: `« ${product.name} » écarté : contient ${duplicated}, déjà présent sur l'ordonnance. Risque de doublement de dose.`,
        subjectType: "PRODUCT",
        subjectId: product.id,
        source: SOURCE,
      });
      continue;
    }

    const haystack = [
      product.name,
      product.description ?? "",
      ...product.matchingTags,
      ...product.contraindications,
    ]
      .join(" ")
      .toLowerCase();

    const matchedAllergy = normalizedAllergies.find((allergy) => haystack.includes(allergy));
    if (matchedAllergy) {
      blockedProductIds.add(product.id);
      findings.push({
        severity: "BLOCKING",
        code: "PATIENT_ALLERGY",
        message: `« ${product.name} » écarté : allergie déclarée (${matchedAllergy}).`,
        subjectType: "PRODUCT",
        subjectId: product.id,
        source: SOURCE,
      });
      continue;
    }

    const contraindications = product.contraindications.map((c) => c.toLowerCase());
    if (patient.isPregnant && contraindications.some((c) => c.includes("grossesse"))) {
      blockedProductIds.add(product.id);
      findings.push({
        severity: "BLOCKING",
        code: "PRODUCT_CONTRAINDICATED_PREGNANCY",
        message: `« ${product.name} » écarté : contre-indiqué pendant la grossesse selon la fiche produit de l'officine.`,
        subjectType: "PRODUCT",
        subjectId: product.id,
        source: SOURCE,
      });
      continue;
    }

    if (
      patient.isBreastfeeding &&
      contraindications.some((c) => c.includes("allaitement"))
    ) {
      blockedProductIds.add(product.id);
      findings.push({
        severity: "BLOCKING",
        code: "PRODUCT_CONTRAINDICATED_BREASTFEEDING",
        message: `« ${product.name} » écarté : contre-indiqué pendant l'allaitement selon la fiche produit de l'officine.`,
        subjectType: "PRODUCT",
        subjectId: product.id,
        source: SOURCE,
      });
      continue;
    }

    if (
      patient.ageYears !== null &&
      patient.ageYears < 12 &&
      contraindications.some((c) => c.includes("enfant"))
    ) {
      blockedProductIds.add(product.id);
      findings.push({
        severity: "BLOCKING",
        code: "PRODUCT_CONTRAINDICATED_CHILD",
        message: `« ${product.name} » écarté : non adapté avant 12 ans selon la fiche produit de l'officine.`,
        subjectType: "PRODUCT",
        subjectId: product.id,
        source: SOURCE,
      });
    }
  }

  return { findings, blockedProductIds };
}

export function hasBlockingFinding(findings: SafetyFindingResult[]): boolean {
  return findings.some((f) => f.severity === "BLOCKING");
}

export function summarizeSeverity(
  findings: SafetyFindingResult[],
): Record<"INFO" | "CAUTION" | "WARNING" | "BLOCKING", number> {
  return findings.reduce(
    (acc, f) => {
      acc[f.severity] += 1;
      return acc;
    },
    { INFO: 0, CAUTION: 0, WARNING: 0, BLOCKING: 0 },
  );
}
