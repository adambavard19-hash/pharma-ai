import "server-only";
import { prisma } from "@/server/db/client";
import { getAIProvider } from "@/server/ai/registry";
import {
  classifyProductByName,
  normalizeProductText,
  restrictToVocabulary,
  rulesServedBy,
  type ClassificationSource,
  type ProductClassificationResult,
} from "@/core/catalog/product-vocabulary";
import type { ProductCategoryCode } from "@/core/ai/types";
import type { TenantScope } from "@/server/db/tenant";
import { tagsFromName } from "@/core/stock-import/tags";

/**
 * Comprendre les produits de l'officine — pour que le moteur puisse les
 * proposer.
 *
 * Deux passes, dans cet ordre. Le dictionnaire d'abord : déterministe, gratuit,
 * instantané, il range l'essentiel du rayon de conseil. Le modèle ensuite,
 * uniquement sur ce que le dictionnaire n'a pas su ranger, par lots, et il ne
 * peut choisir QUE parmi les catégories et le vocabulaire fermé des règles. Le
 * résultat est mis en cache par nom normalisé, pour toutes les officines : un
 * nom de produit n'est pas une donnée de santé.
 *
 * Un produit classé garde les mots de son nom comme étiquettes de recherche ;
 * il gagne en plus les étiquettes d'usage qui le relient aux besoins.
 */

/** Taille d'un lot envoyé au modèle. Au-delà, la réponse s'allonge sans gain. */
export const CLASSIFICATION_BATCH_SIZE = 40;
/** Nombre de lots au plus dans un appel synchrone : le titulaire attend devant son écran. */
export const CLASSIFICATION_MAX_BATCHES_INLINE = 4;

export type ProductToClassify = { id: string; name: string; brand: string | null; description: string | null };

export type ClassificationRunSummary = {
  considered: number;
  fromCache: number;
  byHeuristic: number;
  byAi: number;
  /** Rangés dans une catégorie, mais sans étiquette d'usage : ils ne servent aucune règle. */
  withoutUsage: number;
  /** Restés sans classification (modèle indisponible ou réponse écartée). */
  unclassified: number;
  /** Ce qu'il reste à classer au-delà de la borne de cet appel. */
  remaining: number;
  aiAvailable: boolean;
  warnings: string[];
};

export function classificationKey(name: string): string {
  return normalizeProductText(name).replace(/\s+/g, " ").trim();
}

type Decision = ProductClassificationResult & { source: ClassificationSource; fromCache: boolean };

/** Classe les produits donnés (par défaut : tous ceux de l'officine jamais classés). */
export async function classifyPharmacyProducts(params: {
  scope: TenantScope;
  productIds?: string[];
  /** Forcer le repassage de produits déjà classés (après une mise à jour du dictionnaire, par exemple). */
  force?: boolean;
  maxAiBatches?: number;
}): Promise<ClassificationRunSummary> {
  const products = await prisma.product.findMany({
    where: {
      pharmacyId: params.scope.pharmacyId,
      deletedAt: null,
      ...(params.productIds ? { id: { in: params.productIds } } : {}),
      ...(params.force ? {} : { classifiedAt: null }),
    },
    select: { id: true, name: true, brand: true, description: true },
    orderBy: { createdAt: "asc" },
  });

  const summary: ClassificationRunSummary = {
    considered: products.length,
    fromCache: 0,
    byHeuristic: 0,
    byAi: 0,
    withoutUsage: 0,
    unclassified: 0,
    remaining: 0,
    aiAvailable: false,
    warnings: [],
  };
  if (products.length === 0) return summary;

  // 1. Le cache partagé.
  const keys = [...new Set(products.map((p) => classificationKey(p.name)).filter(Boolean))];
  const cached = new Map(
    (await prisma.productClassification.findMany({ where: { key: { in: keys } } })).map((row) => [row.key, row]),
  );

  const decisions = new Map<string, Decision>();
  const pendingForAi: ProductToClassify[] = [];

  for (const product of products) {
    const key = classificationKey(product.name);
    const hit = key ? cached.get(key) : undefined;
    if (hit) {
      decisions.set(product.id, {
        category: hit.category as ProductCategoryCode,
        tags: hit.tags,
        confidence: hit.confidence,
        source: hit.source as ClassificationSource,
        ruleKeys: rulesServedBy(hit.category as ProductCategoryCode, hit.tags),
        fromCache: true,
      });
      summary.fromCache += 1;
      continue;
    }
    // 2. Le dictionnaire. Un motif qui sert une règle suffit ; une catégorie
    // générique est gardée en repli mais le modèle peut encore préciser.
    const heuristic = classifyProductByName(product.name, { brand: product.brand, description: product.description });
    if (heuristic && heuristic.tags.length > 0) {
      decisions.set(product.id, { ...heuristic, fromCache: false });
      summary.byHeuristic += 1;
      continue;
    }
    pendingForAi.push(product);
    if (heuristic) decisions.set(product.id, { ...heuristic, fromCache: false });
  }

  // 3. Le modèle, sur le reste, par lots bornés.
  const provider = getAIProvider();
  summary.aiAvailable = provider.info.capability === "LIVE";
  const maxBatches = params.maxAiBatches ?? CLASSIFICATION_MAX_BATCHES_INLINE;
  const batches: ProductToClassify[][] = [];
  for (let i = 0; i < pendingForAi.length; i += CLASSIFICATION_BATCH_SIZE) {
    batches.push(pendingForAi.slice(i, i + CLASSIFICATION_BATCH_SIZE));
  }
  const processed = batches.slice(0, maxBatches);
  summary.remaining = batches.slice(maxBatches).reduce((sum, batch) => sum + batch.length, 0);

  if (summary.aiAvailable) {
    for (const batch of processed) {
      const startedAt = Date.now();
      try {
        const response = await provider.classifyProducts({
          products: batch.map((p, index) => ({ index, name: p.name, brand: p.brand, description: p.description })),
        });
        if (!response) break;
        summary.warnings.push(...response.warnings.slice(0, 5));
        for (const result of response.results) {
          const product = batch[result.index];
          if (!product) continue;
          const decision: Decision = { ...result, tags: restrictToVocabulary(result.tags), source: "AI", ruleKeys: rulesServedBy(result.category, result.tags), fromCache: false };
          decisions.set(product.id, decision);
          summary.byAi += 1;
          const key = classificationKey(product.name);
          if (key) {
            await prisma.productClassification.upsert({
              where: { key },
              create: { key, category: decision.category, tags: decision.tags, confidence: decision.confidence, source: "AI", providerId: response.providerId, model: response.model },
              update: {},
            });
          }
        }
        if (response.usage) {
          await prisma.aiUsageRecord.create({
            data: {
              organizationId: params.scope.organizationId,
              pharmacyId: params.scope.pharmacyId,
              provider: response.providerId,
              operation: "product.classification",
              model: response.model,
              inputTokens: response.usage.inputTokens,
              outputTokens: response.usage.outputTokens,
              durationMs: response.usage.durationMs,
              succeeded: true,
            },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[product-classification] appel impossible : ${message}`);
        summary.warnings.push(`Classification par le modèle impossible : ${message}`);
        await prisma.aiUsageRecord
          .create({
            data: {
              organizationId: params.scope.organizationId,
              pharmacyId: params.scope.pharmacyId,
              provider: provider.info.id,
              operation: "product.classification",
              durationMs: Date.now() - startedAt,
              succeeded: false,
            },
          })
          .catch(() => undefined);
        break;
      }
    }
  } else if (pendingForAi.length > 0) {
    summary.warnings.push("Aucun modèle configuré : seuls les produits reconnus par le dictionnaire ont reçu des étiquettes d'usage.");
  }

  // 4. Écriture sur les produits. Le dictionnaire écrit aussi dans le cache :
  // la prochaine officine n'aura même pas à le relire.
  for (const product of products) {
    const decision = decisions.get(product.id);
    if (!decision) {
      summary.unclassified += 1;
      continue;
    }
    if (decision.tags.length === 0) summary.withoutUsage += 1;
    const tags = [...new Set([...decision.tags, ...tagsFromName(product.name)])];
    await prisma.product.update({
      where: { id: product.id },
      data: { category: decision.category, matchingTags: tags, classifiedAt: new Date(), classificationSource: decision.source },
    });
    if (!decision.fromCache && decision.source === "HEURISTIC") {
      const key = classificationKey(product.name);
      if (key) {
        await prisma.productClassification.upsert({
          where: { key },
          create: { key, category: decision.category, tags: decision.tags, confidence: decision.confidence, source: "HEURISTIC" },
          update: {},
        });
      }
    }
  }

  return summary;
}

/** Combien de produits de l'officine le moteur ne peut pas encore relier à un besoin. */
export async function countUnclassifiedProducts(pharmacyId: string): Promise<number> {
  return prisma.product.count({ where: { pharmacyId, deletedAt: null, classifiedAt: null } });
}
