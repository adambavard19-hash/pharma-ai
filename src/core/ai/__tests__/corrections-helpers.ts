import { RECOMMENDATION_MIN_RELEVANCE, RECOMMENDATION_MIN_SCORE } from "@/config/constants";
import { classifyProductByName } from "@/core/catalog/product-vocabulary";
import { detectAdviceOpportunities } from "../engines/advice";
import { findCandidateProducts } from "../engines/matching";
import { scoreProductForOpportunity } from "../engines/scoring";
import { runAnalysisPipeline } from "../pipeline";
import type { CatalogProduct, PatientContext } from "../types";
import { drug, patient, product } from "./fixtures";

/**
 * Les outils des tests de corrections du lot « conseil complet par ordonnance » : ils rejouent le
 * parcours RÉEL du moteur (opportunité détectée par la règle, `findCandidateProducts`,
 * `scoreProductForOpportunity`, puis les deux seuils de la pipeline) avec de vrais noms de produits
 * relevés dans les fichiers de stock — pas la seule expression régulière d'une règle, qu'une
 * préférence peut contourner (matching.ts : un motif préféré lève une exclusion).
 */

/** Un produit tel qu'un fichier de stock le livre : le dictionnaire le range, sauf mention contraire. */
export function stock(id: string, name: string, over: Partial<CatalogProduct> = {}): CatalogProduct {
  const classified = classifyProductByName(name);
  return product({
    id,
    name,
    brand: null,
    category: classified?.category ?? "AUTRE",
    subCategory: null,
    matchingTags: classified?.tags ?? [],
    commercialClaims: [],
    description: null,
    stockQuantity: 6,
    salePriceCents: 1200,
    ...over,
  });
}

export function detect(atcCode: string, over: { patient?: Partial<PatientContext>; substance?: string; durationDays?: number | null } = {}) {
  const substance = over.substance ?? "SUBSTANCE";
  return detectAdviceOpportunities({
    drugs: [
      {
        lineIndex: 0,
        drugName: substance,
        knowledge: drug({ name: substance, inn: substance, atcCode, therapeuticClass: null, commonSideEffects: [] }),
        officialSubstance: substance,
        ...(over.durationDays !== undefined ? { durationDays: over.durationDays } : {}),
      },
    ],
    patient: patient(over.patient),
    needs: [],
  });
}

/**
 * Ce que le moteur RETIENT pour une règle : candidates du catalogue, score, puis les deux seuils de
 * la pipeline (étapes 5 et 6). Renvoie le nom et la pertinence de chaque produit retenu.
 */
export function retained(key: string, atcCode: string, catalog: CatalogProduct[], over: { patient?: Partial<PatientContext>; durationDays?: number | null } = {}) {
  const patientContext = patient(over.patient);
  const opportunity = detect(atcCode, over).find((o) => o.key === key);
  if (!opportunity) return [];
  const out: { name: string; relevance: number }[] = [];
  for (const candidate of findCandidateProducts({ opportunity, catalog })) {
    const scored = scoreProductForOpportunity({ product: candidate.product, opportunity, patient: patientContext, rules: [], history: {}, blockedProductIds: new Set() });
    if (scored && scored.totalScore >= RECOMMENDATION_MIN_SCORE && scored.breakdown.relevance >= RECOMMENDATION_MIN_RELEVANCE) {
      out.push({ name: candidate.product.name, relevance: scored.breakdown.relevance });
    }
  }
  return out;
}
export const names = (list: { name: string }[]) => list.map((item) => item.name);

/** Une ordonnance d'un seul médicament, de bout en bout dans la pipeline. */
export function analyse(atcCode: string, catalog: CatalogProduct[], over: { patient?: Partial<PatientContext>; substance?: string; durationDays?: number | null } = {}) {
  const substance = over.substance ?? "SUBSTANCE";
  return runAnalysisPipeline({
    lines: [{ lineIndex: 0, drugName: substance, posology: null, durationDays: over.durationDays ?? null, confirmed: true }],
    knowledge: new Map([[substance.toLowerCase(), drug({ name: substance, inn: substance, atcCode, therapeuticClass: null, commonSideEffects: [] })]]),
    patient: patient(over.patient),
    catalog,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    usedSimulatedProviders: false,
  });
}

/** Les noms des produits proposés pour une règle (ou une étape de routine). */
export const namesFor = (result: ReturnType<typeof analyse>, key: string, catalog: CatalogProduct[]) =>
  result.recommendations.filter((r) => r.opportunityKey === key).map((r) => catalog.find((p) => p.id === r.productId)!.name);
