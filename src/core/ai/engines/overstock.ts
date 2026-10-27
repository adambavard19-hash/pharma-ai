import type { AdviceOpportunityResult, CatalogProduct, PatientContext, ScoredAlternative, ScoredRecommendation } from "../types";
import { suggestionVigilances } from "./population-vigilance";

/**
 * Les campagnes de surstock (fondateur, 25 oct. 2026) : un produit conseil acheté en trop — par 12, 24, 48 — reste en rayon
 * alors que la facture se paie à 60 jours. Le pharmacien met ce produit « en campagne » et dit QUAND le proposer :
 *
 *  • des classes de médicaments de la vente (codes ATC : « J01 », les antibiotiques) ;
 *  • des familles de produits (« Multivitamines », « Immunité ») : le patient en prend un, OU PharmaBoost en conseille un.
 *
 * Alors le produit en surstock passe EN PREMIER. Quand PharmaBoost allait conseiller un produit d'une de ces familles, le produit
 * en surstock prend sa place, et le produit d'origine reste proposé en solution de repli (« si le patient n'en veut pas »).
 *
 * Une campagne ne contourne jamais la sécurité : un produit en rupture, soumis à prescription, déjà dans la vente ou écarté pour
 * ce patient (contre-indication, vigilance, interaction) n'est pas proposé — exactement les garde-fous des associations.
 *
 * Module PUR : aucune base, aucune horloge. Le produit, les familles et les classes sont choisis par le pharmacien ; aucune
 * allégation n'est générée (sa phrase, sinon une formule neutre).
 */

export const OVERSTOCK_KEY_PREFIX = "surstock:";
/** Au plus deux produits en surstock par vente : au-delà, le comptoir ne parle plus que de ça. */
export const MAX_OVERSTOCK_ADVICE = 2;
/** Combien de produits d'origine, remplacés, restent proposés en repli. */
const MAX_REPLACED_KEPT = 2;

export type OverstockCampaignRule = {
  id: string;
  productId: string;
  /** Ce qui déclenche dans la vente : `atc:J01`, `family:<id>` (les clés des associations). */
  triggerKeys: readonly string[];
  /** Les produits du catalogue des familles choisies : conseillés par PharmaBoost, ils cèdent leur place. */
  replaceProductIds: ReadonlySet<string>;
  sentence: string | null;
};

export type OverstockInput = {
  /** Les campagnes actives, dans l'ordre de lancement. */
  campaigns: OverstockCampaignRule[];
  /** Chaque ligne de la vente et les clés qu'elle porte (même résolution que les associations). */
  lines: { lineIndex: number; keys: string[]; productId: string | null }[];
};

export type OverstockSkipReason = "NOT_IN_CATALOG" | "PRESCRIPTION_ONLY" | "ALREADY_IN_SALE" | "SAFETY" | "OUT_OF_STOCK" | "LIMIT";

export const OVERSTOCK_SKIP_LABELS: Record<OverstockSkipReason, string> = {
  NOT_IN_CATALOG: "le produit n'est plus au catalogue de l'officine",
  PRESCRIPTION_ONLY: "le produit est soumis à prescription : jamais en vente additionnelle",
  ALREADY_IN_SALE: "le produit est déjà dans la vente",
  SAFETY: "le produit est écarté par la sécurité pour ce patient",
  OUT_OF_STOCK: "le produit est en rupture de stock",
  LIMIT: `limite de ${MAX_OVERSTOCK_ADVICE} produits en surstock par vente`,
};

export type OverstockResult = {
  /** La liste finale : les produits en surstock d'abord, puis les autres conseils, sans ceux qu'ils remplacent. */
  recommendations: ScoredRecommendation[];
  opportunities: AdviceOpportunityResult[];
  notes: string[];
};

/** Le nom sans la forme : coupé à la virgule suivie d'une espace, jamais à la virgule décimale (« 62,5 mg »). */
const spoken = (name: string): string => name.split(/,\s/)[0].trim();

export function applyOverstockCampaigns(args: {
  overstock: OverstockInput;
  lines: { lineIndex: number; drugName: string | null }[];
  catalog: CatalogProduct[];
  blockedProductIds: ReadonlySet<string>;
  /** Tous les conseils déjà retenus (moteur et associations), dans leur ordre. */
  recommendations: ScoredRecommendation[];
  patient: PatientContext;
  /** Les boîtes qui ont déclenché chaque conseil (par clé de conseil). */
  triggeredBy?: ReadonlyMap<string, AdviceOpportunityResult["triggeredBy"]>;
  /** La priorité de chaque conseil (par clé) : le plus prioritaire des conseils remplacés reste en tête du repli. */
  priorityByKey?: ReadonlyMap<string, number>;
}): OverstockResult {
  const catalogById = new Map(args.catalog.map((product) => [product.id, product]));
  const lineName = (lineIndex: number) => args.lines.find((line) => line.lineIndex === lineIndex)?.drugName ?? null;
  const inSale = new Set(args.overstock.lines.map((line) => line.productId).filter((id): id is string => id !== null));

  let rest = [...args.recommendations];
  const promoted: ScoredRecommendation[] = [];
  const opportunities: AdviceOpportunityResult[] = [];
  const notes: string[] = [];

  for (const campaign of args.overstock.campaigns) {
    const product = catalogById.get(campaign.productId);
    const label = product?.name ?? "produit inconnu";
    const triggers = args.overstock.lines.filter((line) => line.keys.some((key) => campaign.triggerKeys.includes(key)));
    const replaced = rest.filter((rec) => rec.productId !== campaign.productId && campaign.replaceProductIds.has(rec.productId));
    const existing = rest.find((rec) => rec.productId === campaign.productId) ?? null;
    // Rien dans la vente ne l'appelle : la campagne ne s'applique pas ici, et il n'y a rien à dire.
    if (triggers.length === 0 && replaced.length === 0 && !existing) continue;
    const skip = (reason: OverstockSkipReason) => notes.push(`Surstock « ${label} » non proposé : ${OVERSTOCK_SKIP_LABELS[reason]}.`);

    if (!product || !product.isActive) { skip("NOT_IN_CATALOG"); continue; }
    if (product.prescriptionConditions.length > 0) { skip("PRESCRIPTION_ONLY"); continue; }
    if (inSale.has(product.id)) { skip("ALREADY_IN_SALE"); continue; }
    if (args.blockedProductIds.has(product.id)) { skip("SAFETY"); continue; }
    if (product.stockQuantity <= 0) { skip("OUT_OF_STOCK"); continue; }
    if (promoted.length >= MAX_OVERSTOCK_ADVICE) { skip("LIMIT"); continue; }

    // Les produits d'origine cèdent leur place ; ils restent en repli, le patient garde le choix. Le conseil le plus
    // prioritaire d'abord, avec ses propres équivalents : sous amoxicilline, Lactibiane ATB puis Ultra-Levure, avant le
    // confort intime ou les vitamines (fondateur, 26 oct. 2026).
    const priority = (rec: ScoredRecommendation) => args.priorityByKey?.get(rec.opportunityKey) ?? 0;
    const ranked = [...replaced].sort((a, b) => priority(b) - priority(a));
    const kept = ranked.slice(0, MAX_REPLACED_KEPT);
    const keptAlternatives = kept.flatMap((rec): ScoredAlternative[] => [
      {
        productId: rec.productId,
        totalScore: rec.totalScore,
        breakdown: rec.breakdown,
        justification: `Conseil d'origine de PharmaBoost, remplacé par le produit en surstock : à proposer si le patient ne veut pas de « ${product.name} ».`,
        shortReason: rec.shortReason,
        patientReason: rec.patientReason,
        counterScript: rec.counterScript,
        precautions: rec.precautions,
        explanation: rec.explanation,
        vigilances: rec.vigilances,
        shortDate: rec.shortDate ?? null,
      },
      // Son premier équivalent seulement : le repli reste court, et chaque conseil remplacé garde sa place.
      ...(rec.alternatives ?? []).slice(0, 1),
    ]).filter((item, index, list) => item.productId !== product.id && list.findIndex((other) => other.productId === item.productId) === index);
    rest = rest.filter((rec) => !replaced.includes(rec));

    if (existing) {
      // Déjà conseillé par PharmaBoost : il passe en tête, avec les produits qu'il remplace en repli.
      rest = rest.filter((rec) => rec !== existing);
      promoted.push({ ...existing, alternatives: [...keptAlternatives, ...(existing.alternatives ?? [])].slice(0, 3) });
      continue;
    }

    const names = [...new Set([...triggers.map((line) => spoken(lineName(line.lineIndex) ?? (line.productId ? (catalogById.get(line.productId)?.name ?? "") : ""))), ...replaced.map((rec) => spoken(catalogById.get(rec.productId)?.name ?? ""))].filter(Boolean))];
    const why = triggers.length > 0
      ? `avec ${names.slice(0, 2).join(" et ")}`
      : `à la place de ${names.slice(0, 2).map((name) => `« ${name} »`).join(" et ")}`;
    const key = `${OVERSTOCK_KEY_PREFIX}${campaign.id}`;
    const shortReason = `Surstock à écouler en priorité, ${why}`;
    const sentence = campaign.sentence?.trim() || null;
    const triggeredBy = [
      ...triggers.map((line) => ({ lineIndex: line.lineIndex, drugName: lineName(line.lineIndex) ?? "" })),
      // Remplaçant un conseil, il en reprend les boîtes déclencheuses (la carte dit « pour AUGMENTIN »).
      ...replaced.flatMap((rec) => args.triggeredBy?.get(rec.opportunityKey) ?? []),
    ].filter((item, index, list) => list.findIndex((other) => other.lineIndex === item.lineIndex) === index);

    opportunities.push({
      key,
      kind: "COMFORT",
      category: product.category,
      title: `Surstock : ${spoken(product.name)}`,
      rationale: `Votre officine a mis « ${product.name} » en campagne de surstock : il passe en premier ${why}.`,
      shortReason,
      counterScriptTemplate: sentence ?? "",
      patientReasonTemplate: "",
      clinicalContext: null,
      safetyNotes: [],
      priority: 5,
      isBlocked: false,
      blockReason: null,
      matchingTags: [],
      excludeTags: [],
      benefits: [],
      triggeredBy,
      coverage: "COVERED",
      question: null,
      requiresConfirmation: false,
      needKey: null,
      ruleKey: key,
      ruleVersion: "1",
      confirmedReason: null,
    });

    promoted.push({
      opportunityKey: key,
      productId: product.id,
      source: "OVERSTOCK",
      totalScore: 1,
      breakdown: { relevance: 1, safety: 1, availability: 1, patientFit: 1, pharmacistPreference: 1, validationHistory: 0, commercial: 0 },
      justification: `Campagne de surstock de votre officine : « ${product.name} » passe en premier ${why}. Mêmes contrôles que tout conseil : stock, prescription, sécurité du patient.`,
      shortReason,
      patientReason: "",
      counterScript: sentence ?? `Je peux aussi vous proposer « ${spoken(product.name)} ».`,
      precautions: [...product.precautions],
      explanation: [
        { dimension: "pharmacistPreference", label: "Campagne de surstock", value: 1, weight: 1, detail: `Votre officine veut écouler « ${product.name} » (${product.stockQuantity} en stock).`, role: "SCORE" },
        { dimension: "availability", label: "Disponibilité", value: 1, weight: 0, detail: `${product.stockQuantity} en stock : le produit peut être remis.`, role: "FILTRE" },
        { dimension: "safety", label: "Sécurité", value: 1, weight: 0, detail: "Aucune vigilance bloquante sur la fiche produit pour ce patient.", role: "FILTRE" },
      ],
      vigilances: suggestionVigilances([], product, args.patient),
      shortDate: product.shortDate ?? null,
      tiebreak: null,
      alternatives: keptAlternatives,
    });
  }

  return { recommendations: [...promoted, ...rest], opportunities, notes };
}
