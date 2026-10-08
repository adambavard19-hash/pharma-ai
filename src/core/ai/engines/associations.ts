import { normalizeSearchText } from "@/core/reference/search";
import type { AdviceOpportunityResult, CatalogProduct, PatientContext, ScoredRecommendation } from "../types";
import { suggestionVigilances } from "./population-vigilance";

/**
 * Les associations de produits de l'officine : le SECOND axe du conseil.
 *
 * Premier axe — un MÉDICAMENT déclenche un produit conseil (les règles du moteur : amoxicilline → spray nasal).
 * Second axe — un PRODUIT conseil en appelle un autre, sans qu'aucun médicament ne soit en cause : une vente
 * spontanée du spray nasal propose Olioseptil Bronche. C'est le pharmacien qui écrit l'association ; ce module ne
 * fait que l'APPLIQUER, avec les mêmes garde-fous que tout conseil. Une association ne contourne jamais :
 *
 *  • le stock : on ne propose pas ce qu'on ne peut pas remettre ;
 *  • la sécurité : un produit écarté pour ce patient (contre-indication déclarée, vigilance, interaction) reste écarté ;
 *  • l'ordonnance : un médicament à prescription obligatoire ne se propose jamais en vente additionnelle ;
 *  • la vente elle-même : ce qui y est déjà n'est pas reproposé, ni ce que le moteur propose déjà par ailleurs.
 *
 * Le DÉCLENCHEUR est soit un produit du stock (« product:<id> »), soit un médicament du catalogue national, reconnu par
 * son nom sans la forme (« drug:CORYZALIA » pour « CORYZALIA, comprimé orodispersible » comme pour « CORYZALIA, solution
 * buvable ») : un médicament conseil se lit par son code CIP, il n'est pas dans le stock de l'officine.
 *
 * Module PUR : aucune base, aucune API, aucune horloge. Les textes affichés sont ceux que le pharmacien a écrits ;
 * rien n'est généré, aucune allégation de santé n'est ajoutée.
 */

/** La clé d'un produit du stock comme déclencheur. */
export const productKey = (productId: string): string => `product:${productId}`;

/**
 * La clé d'un médicament comme déclencheur : son nom sans la forme galénique, sans accents ni casse.
 * « CORYZALIA, comprimé orodispersible » et « Coryzalia » donnent la même clé ; « DOLIPRANE 500 mg » et
 * « DOLIPRANE 1000 mg » en donnent deux (le dosage fait partie du nom).
 */
export function drugKey(name: string): string {
  return `drug:${normalizeSearchText(name.split(",")[0])}`;
}

/** Le nom tel qu'on le dit à voix haute : sans la forme galénique. */
const spokenName = (name: string): string => name.split(",")[0].trim();

export type ProductAssociationRule = {
  id: string;
  /** Ce qui déclenche : `productKey(id)` ou `drugKey(nom)`. */
  triggerKey: string;
  adviceProductId: string;
  /** Ce que le pharmacien dit au patient, écrit par lui. */
  sentence: string | null;
  /** Le plus petit d'abord. */
  sortOrder: number;
};

export type AssociationInput = {
  /** Les associations actives de l'officine. */
  rules: ProductAssociationRule[];
  /**
   * Chaque ligne de la vente : les clés qu'elle porte (le médicament qu'elle est, le produit du stock qu'elle est) et, le
   * cas échéant, ce produit du stock — pour ne pas reproposer ce qui est déjà dans la vente.
   */
  lines: { lineIndex: number; keys: string[]; productId: string | null }[];
};

/** Combien d'associations au plus se proposent sur une vente : au-delà, le comptoir est noyé. */
export const MAX_ASSOCIATION_ADVICE = 3;

export type AssociationSkipReason = "NOT_IN_CATALOG" | "PRESCRIPTION_ONLY" | "ALREADY_IN_SALE" | "SAFETY" | "OUT_OF_STOCK" | "ALREADY_PROPOSED" | "LIMIT";

/** Pourquoi une association qui s'applique n'est pas proposée : lu dans la trace de l'analyse. */
export const ASSOCIATION_SKIP_LABELS: Record<AssociationSkipReason, string> = {
  NOT_IN_CATALOG: "le produit conseillé n'est plus au catalogue de l'officine",
  PRESCRIPTION_ONLY: "le produit conseillé est soumis à prescription : jamais en vente additionnelle",
  ALREADY_IN_SALE: "le produit conseillé est déjà dans la vente",
  SAFETY: "le produit conseillé est écarté par la sécurité pour ce patient",
  OUT_OF_STOCK: "le produit conseillé est en rupture de stock",
  ALREADY_PROPOSED: "le produit conseillé est déjà proposé pour un autre conseil",
  LIMIT: `limite de ${MAX_ASSOCIATION_ADVICE} associations par vente`,
};

export type AssociationSkip = { ruleId: string; reason: AssociationSkipReason };

export type AssociationAdvice = {
  opportunities: AdviceOpportunityResult[];
  recommendations: ScoredRecommendation[];
  skipped: AssociationSkip[];
  notes: string[];
};

type Group = {
  advice: CatalogProduct;
  rules: ProductAssociationRule[];
  triggers: { lineIndex: number; name: string; productId: string }[];
};

const listNames = (names: string[]): string => {
  const unique = [...new Set(names)];
  const quoted = unique.map((name) => `« ${name} »`);
  return quoted.length <= 1 ? (quoted[0] ?? "") : `${quoted.slice(0, -1).join(", ")} et ${quoted[quoted.length - 1]}`;
};

export function buildAssociationAdvice(args: {
  association: AssociationInput;
  lines: { lineIndex: number; drugName: string | null }[];
  catalog: CatalogProduct[];
  /** Les produits que le moteur de sécurité a écartés pour ce patient (contre-indications, vigilances, interactions). */
  blockedProductIds: ReadonlySet<string>;
  /** Les produits que le moteur propose déjà par ailleurs : pas deux cartes pour la même référence. */
  alreadyProposedProductIds: ReadonlySet<string>;
  patient: PatientContext;
  max?: number;
}): AssociationAdvice {
  const max = args.max ?? MAX_ASSOCIATION_ADVICE;
  const catalogById = new Map(args.catalog.map((product) => [product.id, product]));
  const lineNameOf = (lineIndex: number) => args.lines.find((line) => line.lineIndex === lineIndex)?.drugName ?? null;

  // Pour chaque clé de la vente : où elle se trouve, et sous quel nom elle est affichée.
  const triggersByKey = new Map<string, { lineIndex: number; name: string; productId: string }[]>();
  for (const { lineIndex, keys, productId } of args.association.lines) {
    const name = spokenName(lineNameOf(lineIndex) ?? (productId ? catalogById.get(productId)?.name : undefined) ?? "ce produit");
    for (const key of keys) triggersByKey.set(key, [...(triggersByKey.get(key) ?? []), { lineIndex, name, productId: productId ?? "" }]);
  }
  const inSale = new Set(args.association.lines.map((line) => line.productId).filter((id): id is string => id !== null));

  const skipped: AssociationSkip[] = [];
  const notes: string[] = [];
  const groups = new Map<string, Group>();
  const rules = [...args.association.rules].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  for (const rule of rules) {
    const triggers = triggersByKey.get(rule.triggerKey);
    // Le déclencheur n'est pas dans la vente : l'association ne s'applique pas, et il n'y a rien à dire.
    if (!triggers) continue;
    const advice = catalogById.get(rule.adviceProductId);
    const note = (reason: AssociationSkipReason) => {
      skipped.push({ ruleId: rule.id, reason });
      notes.push(`Association ${listNames(triggers.map((t) => t.name))} → ${listNames([advice?.name ?? "produit inconnu"])} non proposée : ${ASSOCIATION_SKIP_LABELS[reason]}.`);
    };
    if (!advice || !advice.isActive || advice.origin !== "PHARMACY_CATALOG") { note("NOT_IN_CATALOG"); continue; }
    if (advice.prescriptionConditions.length > 0) { note("PRESCRIPTION_ONLY"); continue; }
    if (inSale.has(advice.id)) { note("ALREADY_IN_SALE"); continue; }
    if (args.blockedProductIds.has(advice.id)) { note("SAFETY"); continue; }
    if (advice.stockQuantity <= 0) { note("OUT_OF_STOCK"); continue; }
    if (args.alreadyProposedProductIds.has(advice.id)) { note("ALREADY_PROPOSED"); continue; }

    const group = groups.get(advice.id);
    if (group) {
      group.rules.push(rule);
      for (const trigger of triggers) if (!group.triggers.some((known) => known.lineIndex === trigger.lineIndex)) group.triggers.push(trigger);
    } else {
      groups.set(advice.id, { advice, rules: [rule], triggers: [...triggers] });
    }
  }

  const retained = [...groups.values()].slice(0, max);
  for (const dropped of [...groups.values()].slice(max)) {
    for (const rule of dropped.rules) {
      skipped.push({ ruleId: rule.id, reason: "LIMIT" });
      notes.push(`Association vers ${listNames([dropped.advice.name])} non proposée : ${ASSOCIATION_SKIP_LABELS.LIMIT}.`);
    }
  }

  const opportunities: AdviceOpportunityResult[] = [];
  const recommendations: ScoredRecommendation[] = [];
  retained.forEach((group, index) => {
    const { advice, rules: groupRules, triggers } = group;
    const names = listNames(triggers.map((trigger) => trigger.name));
    // La phrase du pharmacien qui prime : la première association (dans l'ordre choisi) qui en porte une.
    const sentence = groupRules.map((rule) => rule.sentence?.trim()).find((text): text is string => Boolean(text)) ?? null;
    const key = `association:${groupRules[0].id}`;
    const shortReason = `Association de votre officine avec ${names}`;

    opportunities.push({
      key,
      kind: "COMFORT",
      category: advice.category,
      title: `Associé à ${names}`,
      rationale: `Votre officine associe ${names} à « ${advice.name} ».`,
      shortReason,
      counterScriptTemplate: sentence ?? "",
      patientReasonTemplate: "",
      clinicalContext: null,
      safetyNotes: [],
      // Une association se range APRÈS les besoins cliniques : la priorité clinique est le premier critère de tri.
      priority: 5,
      isBlocked: false,
      blockReason: null,
      matchingTags: [],
      excludeTags: [],
      benefits: [],
      triggeredBy: triggers.map((trigger) => ({ lineIndex: trigger.lineIndex, drugName: trigger.name })),
      coverage: "COVERED",
      question: null,
      requiresConfirmation: false,
      needKey: null,
      ruleKey: key,
      ruleVersion: "1",
      confirmedReason: null,
    });

    recommendations.push({
      opportunityKey: key,
      productId: advice.id,
      source: "ASSOCIATION",
      totalScore: Math.max(0.5, 0.7 - index * 0.02),
      breakdown: { relevance: 1, safety: 1, availability: 1, patientFit: 1, pharmacistPreference: 1, validationHistory: 0, commercial: 0 },
      justification: `Association définie par votre officine : ${names} → « ${advice.name} ». Elle passe par les mêmes contrôles que tout conseil : stock, sécurité, fiche produit, patient.`,
      shortReason,
      patientReason: "",
      // Les mots du pharmacien s'il en a écrit ; sinon une phrase neutre, sans aucune allégation.
      counterScript: sentence ?? `Avec ${names}, je peux aussi vous proposer « ${advice.name} ».`,
      precautions: [...advice.precautions],
      explanation: [
        { dimension: "pharmacistPreference", label: "Association de votre officine", value: 1, weight: 1, detail: `${names} ${triggers.length > 1 ? "sont" : "est"} dans la vente : vous avez associé « ${advice.name} ».`, role: "SCORE" },
        { dimension: "availability", label: "Disponibilité", value: 1, weight: 0, detail: `${advice.stockQuantity} en stock : le produit peut être remis.`, role: "FILTRE" },
        { dimension: "safety", label: "Sécurité", value: 1, weight: 0, detail: "Aucune vigilance bloquante sur la fiche produit pour ce patient.", role: "FILTRE" },
      ],
      vigilances: suggestionVigilances([], advice, args.patient),
      shortDate: advice.shortDate ?? null,
      tiebreak: null,
    });
    notes.push(`Association ${names} → « ${advice.name} » proposée.`);
  });

  return { opportunities, recommendations, skipped, notes };
}
