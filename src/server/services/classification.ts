import "server-only";
import { prisma } from "@/server/db/client";
import { getAIProvider } from "@/server/ai/registry";
import { normalizeSearchText } from "@/core/reference/search";
import type {
  ClassificationResult,
  DrugClassification,
  UnderstandingLine,
} from "@/core/understanding";
import type { TenantScope } from "@/server/db/tenant";

/**
 * La classification des médicaments, avec sa mémoire.
 *
 * Un médicament ne change pas de substance d'une ordonnance à l'autre. Une
 * fois classé par le modèle, il est écrit dans `drug_classifications` et n'y
 * repasse plus : l'analyse suivante le lit en une requête. Seules les lignes
 * inconnues déclenchent un appel — court, parce qu'il ne demande que la
 * classification — et l'appel est lancé dès le dépôt de l'ordonnance, pendant
 * que le pharmacien relit les lignes. Au moment de confirmer, tout est là.
 */

export type ClassificationOutcome = {
  drugs: DrugClassification[];
  providerId: string;
  model: string;
  warnings: string[];
  usage: ClassificationResult["usage"];
  cachedCount: number;
  /** Durée totale, appel compris s'il y en a eu un. */
  durationMs: number;
};

/** La clé de cache : le nom tel qu'écrit, normalisé. « Rulid » et « RULID » ne font qu'un. */
export function classificationKey(drugName: string): string {
  return normalizeSearchText(drugName).replace(/\s+/g, " ").trim();
}

export async function ensureClassifications(params: {
  scope: TenantScope;
  lines: UnderstandingLine[];
}): Promise<ClassificationOutcome> {
  const startedAt = Date.now();
  const provider = getAIProvider();
  const keyed = params.lines.map((line) => ({ line, key: classificationKey(line.drugName) }));
  const keys = [...new Set(keyed.map((item) => item.key).filter(Boolean))];

  const cached = keys.length
    ? await prisma.drugClassification.findMany({ where: { key: { in: keys } } })
    : [];
  const byKey = new Map(cached.map((row) => [row.key, row]));

  const drugs: DrugClassification[] = [];
  const missing: UnderstandingLine[] = [];
  for (const { line, key } of keyed) {
    const hit = key ? byKey.get(key) : undefined;
    if (hit) {
      drugs.push({
        lineIndex: line.lineIndex,
        substance: hit.substance,
        atcCode: hit.atcCode,
        therapeuticClass: hit.therapeuticClass,
        commonSideEffects: hit.commonSideEffects,
        confidence: hit.confidence,
        source: "CACHE",
      });
    } else if (key) {
      missing.push(line);
    }
  }

  let warnings: string[] = [];
  let usage: ClassificationResult["usage"] = null;
  let model = provider.info.id.split(":")[1] ?? "";

  if (missing.length > 0) {
    try {
      const result = await provider.classifyDrugs({ lines: missing });
      if (result) {
        warnings = result.warnings;
        usage = result.usage;
        model = result.model;
        for (const drug of result.drugs) {
          drugs.push(drug);
          const line = missing.find((candidate) => candidate.lineIndex === drug.lineIndex);
          if (!line) continue;
          // Écrit une fois, relu toujours. Une classification sans ATC ni
          // classe n'est pas conservée : elle ne servirait à rien et
          // bloquerait une meilleure réponse plus tard.
          if (drug.atcCode || drug.therapeuticClass) {
            await prisma.drugClassification.upsert({
              where: { key: classificationKey(line.drugName) },
              create: {
                key: classificationKey(line.drugName),
                substance: drug.substance,
                atcCode: drug.atcCode,
                therapeuticClass: drug.therapeuticClass,
                commonSideEffects: drug.commonSideEffects,
                confidence: drug.confidence,
                providerId: result.providerId,
                model: result.model,
              },
              update: {},
            });
          }
        }
        if (result.usage) {
          await prisma.aiUsageRecord.create({
            data: {
              organizationId: params.scope.organizationId,
              pharmacyId: params.scope.pharmacyId,
              provider: result.providerId,
              operation: "drug.classification",
              model: result.model,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              durationMs: result.usage.durationMs,
              succeeded: true,
            },
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[classification] appel impossible : ${message}`);
      warnings = [`Classification impossible : ${message}`];
      await prisma.aiUsageRecord
        .create({
          data: {
            organizationId: params.scope.organizationId,
            pharmacyId: params.scope.pharmacyId,
            provider: provider.info.id,
            operation: "drug.classification",
            durationMs: Date.now() - startedAt,
            succeeded: false,
          },
        })
        .catch(() => undefined);
    }
  }

  drugs.sort((a, b) => a.lineIndex - b.lineIndex);
  return {
    drugs,
    providerId: provider.info.id,
    model,
    warnings,
    usage,
    cachedCount: drugs.filter((drug) => drug.source === "CACHE").length,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Préchauffage : classer les médicaments lus dès le dépôt, sans attendre.
 *
 * Appelé après la lecture d'une ordonnance, en arrière-plan. Le pharmacien
 * relit les lignes pendant que le modèle classe ; à la confirmation, le cache
 * est déjà rempli et l'analyse n'appelle plus personne.
 */
export async function prewarmClassifications(params: {
  scope: TenantScope;
  drugNames: string[];
}): Promise<void> {
  const lines: UnderstandingLine[] = params.drugNames
    .filter((name) => name.trim().length > 0)
    .map((drugName, index) => ({
      lineIndex: index,
      drugName,
      dosage: null,
      form: null,
      posology: null,
      durationDays: null,
      officialName: null,
      officialSubstances: [],
    }));
  if (lines.length === 0) return;
  const outcome = await ensureClassifications({ scope: params.scope, lines });
  console.info(
    `[classification] préchauffage — ${lines.length} nom(s), ${outcome.cachedCount} déjà connu(s), ${outcome.durationMs} ms${outcome.usage ? ` (appel ${outcome.usage.durationMs} ms)` : ""}.`,
  );
}
