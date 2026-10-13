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
import { drugClassificationIsUncertain } from "@/core/knowledge/gaps";
import { officialAtcForCis } from "@/core/reference/atc/official-atc";
import { recordGaps } from "@/server/services/knowledge-gap-store";
import { applyOfficialSideEffects } from "@/core/understanding/official-side-effects";
import { loadOfficialSideEffects } from "@/server/services/official-side-effects";

/**
 * La classification des médicaments, avec sa mémoire.
 *
 * Un médicament ne change pas de substance d'une ordonnance à l'autre. Une
 * fois classé par le modèle, il est écrit dans `drug_classifications` et n'y
 * repasse plus : l'analyse suivante le lit en une requête. Seules les lignes
 * inconnues déclenchent un appel — court, parce qu'il ne demande que la
 * classification — et l'appel est lancé dès le dépôt de l'ordonnance, pendant
 * que le pharmacien relit les lignes. Au moment de confirmer, tout est là.
 *
 * Quand le modèle ne répond pas (crédit épuisé, réseau, fournisseur sans
 * modèle, ligne omise ou sans famille), une ligne rattachée au catalogue
 * national reçoit la famille officielle de sa spécialité (Open Medic, voir
 * `src/core/reference/atc`) : la famille d'un médicament courant ne dépend
 * plus du crédit du modèle. Ce secours n'est jamais écrit dans le cache — le
 * modèle classera la ligne plus tard, effets indésirables compris — et ne
 * passe jamais devant une classification en cache ou validée.
 *
 * Les effets indésirables, eux, viennent d'abord du RCP officiel de la spécialité (BDPM, rubrique 4.8, lu par
 * `npm run effets:sync`) : quand il en donne, ils remplacent ceux du modèle — en cache comme à l'instant — et suffisent
 * quand le modèle ne répond pas. Ils ne sont jamais écrits dans le cache : le cache garde la réponse du modèle, le RCP
 * est relu à chaque analyse (une requête, par CIS). Aucun effet officiel enregistré : rien ne change.
 */

export type ClassificationOutcome = {
  drugs: DrugClassification[];
  providerId: string;
  model: string;
  warnings: string[];
  usage: ClassificationResult["usage"];
  cachedCount: number;
  /** Lignes classées d'après la famille officielle, faute de réponse du modèle. */
  officialCount: number;
  /** Lignes dont les effets indésirables viennent du RCP officiel (BDPM). */
  officialSideEffectsCount: number;
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
  const provider = getAIProvider({ demo: params.scope.isDemo });
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

  let unanswered: UnderstandingLine[] = [];
  let warnings: string[] = [];
  let usage: ClassificationResult["usage"] = null;
  let model = provider.info.id.split(":")[1] ?? "";

  if (missing.length > 0) {
    try {
      const result = await provider.classifyDrugs({ lines: missing });
      if (result) {
        // Une ligne que le modèle a lue sans rien répondre : elle reste sans famille, donc à connaître.
        const answered = new Set(result.drugs.map((drug) => drug.lineIndex));
        unanswered = missing.filter((line) => !answered.has(line.lineIndex));
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

  // Le secours : une ligne sans réponse utile du modèle (échec, fournisseur sans modèle, ligne omise, ni ATC ni
  // classe) prend la famille officielle de sa spécialité. La réponse vide du modèle est remplacée, pas doublée.
  const official = new Set<number>();
  for (const line of missing) {
    const at = drugs.findIndex((drug) => drug.lineIndex === line.lineIndex);
    if (at >= 0 && (drugs[at].atcCode || drugs[at].therapeuticClass)) continue;
    const family = officialAtcForCis(line.officialCisCode);
    if (!family) continue;
    const drug: DrugClassification = {
      lineIndex: line.lineIndex,
      substance: line.officialSubstances[0] ?? null,
      atcCode: family.atcCode,
      therapeuticClass: family.therapeuticClass,
      commonSideEffects: [],
      confidence: 1,
      source: "OFFICIAL",
    };
    if (at >= 0) drugs[at] = drug;
    else drugs.push(drug);
    official.add(line.lineIndex);
  }
  if (official.size > 0) {
    unanswered = unanswered.filter((line) => !official.has(line.lineIndex));
    console.info(`[classification] ${official.size} ligne(s) classée(s) d'après la famille officielle (Open Medic), faute de réponse utile du modèle, sur ${missing.length} envoyée(s).`);
  }

  // Les effets indésirables officiels (RCP, BDPM) priment sur ceux du modèle, et suffisent quand il n'a rien dit.
  const officialEffects = applyOfficialSideEffects(drugs, params.lines, await loadOfficialSideEffects(params.lines.map((line) => line.officialCisCode)));
  drugs.splice(0, drugs.length, ...officialEffects.drugs);
  if (officialEffects.applied > 0) console.info(`[classification] ${officialEffects.applied} ligne(s) avec les effets indésirables du RCP officiel (BDPM).`);

  drugs.sort((a, b) => a.lineIndex - b.lineIndex);

  // Un médicament dont on ne sait pas dire la famille, ou dont le modèle doute : la pharmacienne de PharmaBoost le saura. Jamais le titulaire.
  // Un médicament que la pharmacienne a confirmé n'est plus jamais signalé. Seul un échec du modèle (réseau) n'est pas un « trou ».
  if (!warnings.some((warning) => warning.startsWith("Classification impossible"))) {
    const validated = new Map(cached.map((row) => [row.key, row.validatedAt !== null]));
    const lineByIndex = new Map(params.lines.map((line) => [line.lineIndex, line]));
    const gaps = drugs.flatMap((drug) => {
      const line = lineByIndex.get(drug.lineIndex);
      // Une famille officielle n'est pas un « trou » : il n'y a rien à demander à la pharmacienne. Une ligne qui n'a que
      // ses effets officiels reste sans famille : elle est signalée plus bas, avec les lignes sans réponse.
      if (!line || drug.source === "OFFICIAL" || drug.source === "OFFICIAL_RCP") return [];
      const key = classificationKey(line.drugName);
      const doubt = drugClassificationIsUncertain({ atcCode: drug.atcCode, therapeuticClass: drug.therapeuticClass, confidence: drug.confidence, validated: validated.get(key) === true });
      return doubt ? [{ kind: "MEDICINE" as const, key, label: line.drugName, reason: doubt, guess: { substance: drug.substance, atcCode: drug.atcCode, therapeuticClass: drug.therapeuticClass, confidence: drug.confidence }, pharmacyId: params.scope.pharmacyId }] : [];
    });
    for (const line of unanswered) gaps.push({ kind: "MEDICINE" as const, key: classificationKey(line.drugName), label: line.drugName, reason: "NO_FAMILY" as const, guess: undefined as never, pharmacyId: params.scope.pharmacyId });
    await recordGaps(gaps).catch((error) => console.error("[classification] carnet des médicaments à connaître", error));
  }

  return {
    drugs,
    providerId: provider.info.id,
    model,
    warnings,
    usage,
    cachedCount: drugs.filter((drug) => drug.source === "CACHE").length,
    officialCount: official.size,
    officialSideEffectsCount: officialEffects.applied,
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
      // Le préchauffage n'a que des noms lus : pas de spécialité, donc pas de famille officielle. L'analyse l'aura.
      officialCisCode: null,
    }));
  if (lines.length === 0) return;
  const outcome = await ensureClassifications({ scope: params.scope, lines });
  console.info(
    `[classification] préchauffage — ${lines.length} nom(s), ${outcome.cachedCount} déjà connu(s), ${outcome.durationMs} ms${outcome.usage ? ` (appel ${outcome.usage.durationMs} ms)` : ""}.`,
  );
}
