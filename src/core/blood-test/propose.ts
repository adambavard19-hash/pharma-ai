import { matchesAny } from "@/core/ai/engines/product-name";
import { BLOOD_MARKERS, BLOOD_RULES, bloodRuleKey, ruleForMarker, type BloodRule } from "./rules";
import type { BloodFinding } from "./reading";

/**
 * Ce que PharmaBoost propose pour une prise de sang lue : pour chaque valeur hors normes, soit un conseil (règle VALIDÉE,
 * produit sans ordonnance en rayon), soit « à montrer à votre médecin ». Module pur.
 */

export type BloodProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  salePriceCents: number;
  stockQuantity: number;
  prescriptionConditions: string[];
  isActive: boolean;
};

export type BloodProposalProduct = { id: string; name: string; imageUrl: string | null; salePriceCents: number; inStock: boolean };

export type BloodProposal = {
  finding: BloodFinding;
  /** « ADVICE » : un conseil validé s'applique ; « DOCTOR » : rien à proposer, à montrer au médecin. */
  kind: "ADVICE" | "DOCTOR";
  reason: string;
  rule: { key: string; title: string; pharmacistSentence: string; patientSentence: string; cautions: string[] } | null;
  products: BloodProposalProduct[];
};

const MAX_PRODUCTS = 3;

/** Un produit que cette règle peut proposer : reconnu par son nom, jamais exclu, jamais soumis à prescription. */
export function productFitsRule(rule: BloodRule, product: Pick<BloodProduct, "name" | "prescriptionConditions" | "isActive">): boolean {
  if (!product.isActive) return false;
  if (product.prescriptionConditions.length > 0) return false;
  return matchesAny(rule.productPatterns, product.name) && !matchesAny(rule.productExclude, product.name);
}

export function proposeForBloodTest(params: {
  findings: BloodFinding[];
  validatedRuleKeys: ReadonlySet<string>;
  /** Le stock de la pharmacie (comptoir), ou vide (appli : la pharmacie choisira). */
  products: BloodProduct[];
  /** Montrer aussi les règles pas encore validées, marquées comme telles (aperçu de la console seulement). */
  includeUnvalidated?: boolean;
}): BloodProposal[] {
  return params.findings.map((finding) => {
    const doctor = (reason: string): BloodProposal => ({ finding, kind: "DOCTOR", reason, rule: null, products: [] });
    if (finding.direction === "HIGH") return doctor("Valeur au-dessus des normes du laboratoire : à montrer à votre médecin.");
    if (!finding.marker) return doctor("Valeur hors des normes du laboratoire : à montrer à votre médecin.");
    if (finding.veryLow) return doctor(`${BLOOD_MARKERS[finding.marker].label} très en dessous des normes : à montrer à votre médecin avant tout complément.`);
    const rule = ruleForMarker(finding.marker);
    if (!rule) return doctor("Valeur hors des normes du laboratoire : à montrer à votre médecin.");
    if (!params.validatedRuleKeys.has(bloodRuleKey(rule)) && !params.includeUnvalidated) {
      return doctor("Valeur sous les normes du laboratoire : à montrer à votre médecin.");
    }
    const products = params.products
      .filter((product) => productFitsRule(rule, product))
      .sort((a, b) => Number(b.stockQuantity > 0) - Number(a.stockQuantity > 0) || b.stockQuantity - a.stockQuantity || a.name.localeCompare(b.name, "fr"))
      .slice(0, MAX_PRODUCTS)
      .map((product) => ({ id: product.id, name: product.name, imageUrl: product.imageUrl, salePriceCents: product.salePriceCents, inStock: product.stockQuantity > 0 }));
    return {
      finding,
      kind: "ADVICE",
      reason: rule.pharmacistSentence,
      rule: { key: bloodRuleKey(rule), title: rule.title, pharmacistSentence: rule.pharmacistSentence, patientSentence: rule.patientSentence, cautions: rule.cautions },
      products,
    };
  });
}

export function bloodRulesForConsole(): BloodRule[] {
  return BLOOD_RULES;
}
