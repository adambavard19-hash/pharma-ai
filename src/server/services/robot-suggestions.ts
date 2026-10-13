import "server-only";
import { after } from "next/server";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { getAIProvider } from "@/server/ai/registry";
import type { TenantScope } from "@/server/db/tenant";
import type { PipelineInput } from "@/core/ai/pipeline";
import type { AnalysisResult } from "@/core/ai/types";
import { AnthropicRobotSuggester, type RobotSuggester, type RobotSuggestionResponse } from "@/core/ai/providers/anthropic-robot";
import {
  ROBOT_CACHE_DAYS,
  ROBOT_MAX_LINES,
  ROBOT_RETRY_AFTER_FAILURE_MS,
  ROBOT_WAIT_MS,
  applyRobotSuggestions,
  parseRobotItems,
  robotCacheDecision,
  robotSlots,
  selectRobotCandidates,
  uncoveredDrugs,
  type RobotCandidate,
  type RobotDrug,
  type RobotItem,
  type RobotMerge,
  type RobotPlan,
} from "@/core/ai/robot-suggestion";

/**
 * La suggestion du robot — la partie serveur (le domaine : `core/ai/robot-suggestion.ts`).
 *
 * Appelée par l'analyse d'une vente, APRÈS le moteur : si une ligne médicament n'a reçu aucun conseil, on lit la réponse
 * en cache pour (cette officine, ce médicament), ou l'on pose la question au modèle. La vente attend au plus 1,5 s ; si le
 * modèle n'a pas répondu, elle part sans, et la suggestion la rejoint dès qu'elle arrive (la fenêtre du comptoir relit la
 * vente toutes les deux secondes) — ou au plus tard au prochain scan du même médicament, servi par le cache.
 *
 * Jamais pour la démonstration, jamais sans fournisseur autorisé (les conditions de `getAIProvider`), jamais sans stock.
 * Toute erreur est avalée ici : le comptoir ne dépend pas du robot.
 */

export type RobotDeps = {
  /** Le fournisseur ; `null` : aucun. Absent : celui de la configuration. */
  suggester?: RobotSuggester | null;
  waitMs?: number;
  now?: () => Date;
  /** Où confier la suite (la suggestion arrivée après le départ de la vente). Absent : `after()` de Next.js. */
  schedule?: (task: Promise<void>) => void;
};

export type RobotHook = {
  result: AnalysisResult;
  /** À appeler une fois l'analyse enregistrée : ajoute à la vente ce qui arrivera après son départ. `null` : rien n'est attendu. */
  settle: (analysisRunId: string) => Promise<void> | null;
};

const OPERATION = "counter.robot_suggestion";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PHARMACIES_KEPT = 30;

/** Les appels en cours dans ce processus, par (officine, médicament) : un second scan attend le premier au lieu de payer deux fois. */
const inflight = new Map<string, Promise<RobotItem[] | null>>();

/** Le fournisseur des suggestions : exactement les conditions de `getAIProvider` (Anthropic choisi, clé, transmission autorisée). */
export function getRobotSuggester(): RobotSuggester | null {
  const ai = getAIProvider();
  if (ai.info.capability !== "LIVE" || !ai.info.id.startsWith("anthropic:")) return null;
  const apiKey = getEnv().ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new AnthropicRobotSuggester({ apiKey, model: ai.info.id.slice("anthropic:".length) });
}

function scheduleAfterResponse(task: Promise<void>): void {
  try {
    after(() => task);
  } catch {
    // Hors requête (script, test) : la promesse continue seule.
  }
}

type Job = {
  drug: RobotDrug;
  candidates: RobotCandidate[];
  items: RobotItem[];
  pending: Promise<RobotItem[] | null> | null;
  done: boolean;
};

/**
 * Ajoute à l'analyse les suggestions du robot pour les lignes qu'aucun conseil n'a servies. Renvoie l'analyse (inchangée
 * si rien n'est arrivé à temps) et de quoi compléter la vente plus tard.
 */
export async function withRobotSuggestions(
  params: { scope: TenantScope; prescriptionId: string; isDemo: boolean; input: PipelineInput; result: AnalysisResult },
  deps: RobotDeps = {},
): Promise<RobotHook> {
  const unchanged: RobotHook = { result: params.result, settle: () => null };
  try {
    if (params.isDemo || params.scope.isDemo) return unchanged;
    if (params.input.stock?.configured !== true) return unchanged;
    if (robotSlots(params.result, params.input.maxRecommendations) === 0) return unchanged;
    const drugs = uncoveredDrugs(params.input, params.result).slice(0, ROBOT_MAX_LINES);
    if (drugs.length === 0) return unchanged;
    const suggester = deps.suggester === undefined ? getRobotSuggester() : deps.suggester;
    if (!suggester) return unchanged;
    const pharmacy = await prisma.pharmacy.findUnique({ where: { id: params.scope.pharmacyId }, select: { isDemo: true } });
    if (!pharmacy || pharmacy.isDemo) return unchanged;

    const now = deps.now?.() ?? new Date();
    const jobs = await Promise.all(drugs.map((drug) => prepareJob(params.scope, drug, params.input, suggester, now)));
    const waiting = jobs.filter((job) => job.pending);
    if (waiting.length > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.all(
          waiting.map((job) =>
            (job.pending as Promise<RobotItem[] | null>).then(
              (items) => {
                job.items = items ?? [];
                job.done = true;
              },
              () => {
                job.done = true;
              },
            ),
          ),
        ),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, deps.waitMs ?? ROBOT_WAIT_MS);
        }),
      ]);
      clearTimeout(timer);
    }

    // Ce qui est là maintenant part avec la vente ; le reste la rejoindra.
    const late = jobs.filter((job) => job.pending && !job.done).map((job) => ({ drug: job.drug, pending: job.pending as Promise<RobotItem[] | null>, ids: new Set(job.candidates.map((c) => c.productId)) }));
    const plans: RobotPlan[] = jobs
      .filter((job) => !job.pending || job.done)
      .map((job) => ({ drug: job.drug, items: inList(job.items, job.candidates) }))
      .filter((plan) => plan.items.length > 0);
    const merge = plans.length > 0 ? applyRobotSuggestions({ input: params.input, base: params.result, plans }) : null;
    if (merge && merge.added.length > 0) console.info(`[robot] ${merge.added.length} suggestion(s) du robot pour la vente ${params.prescriptionId}.`);
    const result = merge?.result ?? params.result;

    return {
      result,
      settle: (analysisRunId) => {
        if (late.length === 0) return null;
        const task = settleLate({ scope: params.scope, prescriptionId: params.prescriptionId, analysisRunId, input: params.input, base: result, late }).catch((error: unknown) => {
          console.error("[robot] suggestion arrivée après la vente, non ajoutée :", error instanceof Error ? error.message : error);
        });
        (deps.schedule ?? scheduleAfterResponse)(task);
        return task;
      },
    };
  } catch (error) {
    console.error("[robot] suggestion du robot ignorée :", error instanceof Error ? error.message : error);
    return unchanged;
  }
}

const inList = (items: RobotItem[], candidates: RobotCandidate[]) => {
  const ids = new Set(candidates.map((candidate) => candidate.productId));
  return items.filter((item) => ids.has(item.productId));
};

async function prepareJob(scope: TenantScope, drug: RobotDrug, input: PipelineInput, suggester: RobotSuggester, now: Date): Promise<Job> {
  // Ce que la pharmacienne de PharmaBoost a refusé pour ce médicament ne revient jamais, dans aucune officine.
  const refused = await prisma.robotRuleProposal.findMany({ where: { drugKey: drug.drugKey, status: "REFUSED" }, select: { productKey: true } });
  const candidates = selectRobotCandidates({ catalog: input.catalog, drug, refusedProductKeys: new Set(refused.map((row) => row.productKey)) });
  const job: Job = { drug, candidates, items: [], pending: null, done: false };
  if (candidates.length === 0) return job;

  const ids = candidates.map((candidate) => candidate.productId);
  const key = { pharmacyId_drugKey: { pharmacyId: scope.pharmacyId, drugKey: drug.drugKey } };
  const row = await prisma.robotSuggestion.findUnique({ where: key, select: { id: true, status: true, items: true, candidateIds: true, requestedAt: true, expiresAt: true, updatedAt: true } });
  const decision = robotCacheDecision(row, ids, now);
  const flightKey = `${scope.pharmacyId}|${drug.drugKey}`;
  if (decision === "USE") {
    job.items = parseRobotItems(row?.items);
    return job;
  }
  const running = inflight.get(flightKey);
  if (decision === "WAIT" || running) {
    if (running) job.pending = running;
    return job;
  }
  if (!(await claim(scope.pharmacyId, drug, row, now))) return job;
  const pending = askModel(scope, drug, candidates, suggester, now).finally(() => inflight.delete(flightKey));
  inflight.set(flightKey, pending);
  job.pending = pending;
  return job;
}

/** Pose la ligne « en cours » avant l'appel. Un autre serveur l'a fait juste avant : on le laisse répondre. */
async function claim(pharmacyId: string, drug: RobotDrug, row: { id: string; updatedAt: Date } | null, now: Date): Promise<boolean> {
  if (!row) {
    try {
      await prisma.robotSuggestion.create({ data: { pharmacyId, drugKey: drug.drugKey, drugLabel: drug.drugName.slice(0, 200), status: "PENDING", requestedAt: now, expiresAt: new Date(now.getTime() + ROBOT_RETRY_AFTER_FAILURE_MS) } });
      return true;
    } catch {
      return false;
    }
  }
  const won = await prisma.robotSuggestion.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data: { status: "PENDING", requestedAt: now } });
  return won.count === 1;
}

async function askModel(scope: TenantScope, drug: RobotDrug, candidates: RobotCandidate[], suggester: RobotSuggester, now: Date): Promise<RobotItem[] | null> {
  const key = { pharmacyId_drugKey: { pharmacyId: scope.pharmacyId, drugKey: drug.drugKey } };
  const startedAt = Date.now();
  let response: RobotSuggestionResponse | null = null;
  try {
    response = await suggester.suggest({ drug, candidates });
    if (!response.answered) throw new Error(response.warnings[0] ?? "Le modèle n'a pas répondu.");
    const items = await recordProposals(scope.pharmacyId, drug, candidates, response);
    await prisma.robotSuggestion.update({
      where: key,
      data: {
        status: "READY",
        items: items as never,
        candidateIds: candidates.map((candidate) => candidate.productId),
        providerId: response.providerId,
        model: response.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        durationMs: response.usage.durationMs,
        error: response.warnings.length > 0 ? response.warnings.slice(0, 3).join(" ").slice(0, 300) : null,
        expiresAt: new Date(now.getTime() + ROBOT_CACHE_DAYS * DAY_MS),
      },
    });
    await recordUsage(scope, { provider: response.providerId, model: response.model, inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, durationMs: response.usage.durationMs, succeeded: true });
    return items;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[robot] suggestion impossible pour ${drug.drugKey} : ${message}`);
    // Un échec n'est pas « aucun produit » : on ne redemande pas avant un moment, et le comptoir n'attend plus.
    await quietly(() => prisma.robotSuggestion.update({ where: key, data: { status: "FAILED", error: message.slice(0, 300), durationMs: Date.now() - startedAt, expiresAt: new Date(now.getTime() + ROBOT_RETRY_AFTER_FAILURE_MS) } }));
    await recordUsage(scope, { provider: suggester.providerId, model: suggester.model, inputTokens: response?.usage.inputTokens ?? 0, outputTokens: response?.usage.outputTokens ?? 0, durationMs: Date.now() - startedAt, succeeded: false });
    return null;
  }
}

async function recordUsage(scope: TenantScope, data: { provider: string; model: string; inputTokens: number; outputTokens: number; durationMs: number; succeeded: boolean }): Promise<void> {
  await quietly(() => prisma.aiUsageRecord.create({ data: { organizationId: scope.organizationId, pharmacyId: scope.pharmacyId, operation: OPERATION, ...data } }));
}

/** Une écriture accessoire (journal, trace d'échec) ne fait jamais échouer la suite, même si elle lève avant d'avoir commencé. */
async function quietly(write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch {
    // Rien : le comptoir ne dépend pas de cette écriture.
  }
}

/**
 * Chaque choix devient (ou rejoint) une proposition de règle pour la console de la pharmacienne : une ligne par (médicament,
 * produit), toutes officines confondues. Un choix déjà refusé est abandonné.
 */
async function recordProposals(pharmacyId: string, drug: RobotDrug, candidates: RobotCandidate[], response: RobotSuggestionResponse): Promise<RobotItem[]> {
  const byShortId = new Map(candidates.map((candidate) => [candidate.shortId, candidate]));
  const items: RobotItem[] = [];
  for (const choice of response.choices) {
    const candidate = byShortId.get(choice.shortId);
    if (!candidate) continue;
    const where = { drugKey_productKey: { drugKey: drug.drugKey, productKey: candidate.productKey } };
    const select = { id: true, status: true, pharmacyIds: true } as const;
    let row = await prisma.robotRuleProposal.findUnique({ where, select });
    if (!row) {
      row = await prisma.robotRuleProposal
        .create({
          data: {
            drugKey: drug.drugKey,
            drugLabel: drug.drugName.slice(0, 200),
            atcCode: drug.atcCode,
            therapeuticClass: drug.therapeuticClass,
            substance: drug.substances.join(", ").slice(0, 200) || null,
            productKey: candidate.productKey,
            productName: candidate.name.slice(0, 200),
            productBrand: candidate.brand,
            productEan: candidate.ean,
            productCategory: candidate.category,
            productTags: candidate.tags,
            need: choice.need,
            reason: choice.reason,
            counterScript: choice.counterScript,
            pharmacyIds: [pharmacyId],
            providerId: response.providerId,
            model: response.model,
          },
          select,
        })
        // Deux officines au même instant : la seconde rejoint la ligne de la première.
        .catch(() => prisma.robotRuleProposal.findUnique({ where, select }));
      if (!row) continue;
    } else if (row.status !== "REFUSED" && !row.pharmacyIds.includes(pharmacyId)) {
      await prisma.robotRuleProposal.update({ where: { id: row.id }, data: { occurrences: { increment: 1 }, pharmacyIds: [...row.pharmacyIds, pharmacyId].slice(0, MAX_PHARMACIES_KEPT) } });
    }
    if (row.status === "REFUSED") continue;
    items.push({ proposalId: row.id, productId: candidate.productId, need: choice.need, reason: choice.reason, counterScript: choice.counterScript });
  }
  return items;
}

/** La suite : ce qui est arrivé après le départ de la vente passe par le moteur, puis la rejoint si elle est toujours la même. */
async function settleLate(params: {
  scope: TenantScope;
  prescriptionId: string;
  analysisRunId: string;
  input: PipelineInput;
  base: AnalysisResult;
  late: { drug: RobotDrug; pending: Promise<RobotItem[] | null>; ids: Set<string> }[];
}): Promise<void> {
  const plans = (await Promise.all(params.late.map(async (job) => ({ drug: job.drug, items: ((await job.pending) ?? []).filter((item) => job.ids.has(item.productId)) })))).filter((plan) => plan.items.length > 0);
  if (plans.length === 0) return;
  const merge = applyRobotSuggestions({ input: params.input, base: params.base, plans });
  if (merge.added.length === 0) return;
  const created = await persistLateAdvice({ scope: params.scope, prescriptionId: params.prescriptionId, analysisRunId: params.analysisRunId, merge, input: params.input });
  if (created > 0) console.info(`[robot] ${created} suggestion(s) du robot ajoutée(s) après coup à la vente ${params.prescriptionId}.`);
}

/**
 * Enregistre les suggestions arrivées après coup, seulement si la vente n'a pas bougé : toujours « analysée », toujours sur
 * CETTE analyse (un nouveau bip en relance une autre, qui s'en chargera), pas terminée, et sans un produit déjà présent.
 */
async function persistLateAdvice(params: { scope: TenantScope; prescriptionId: string; analysisRunId: string; merge: RobotMerge; input: PipelineInput }): Promise<number> {
  const catalogById = new Map(params.input.catalog.map((product) => [product.id, product]));
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.prescription.findFirst({
      where: { id: params.prescriptionId, pharmacyId: params.scope.pharmacyId },
      select: {
        status: true,
        isDemo: true,
        counterFollowUp: { select: { closedAt: true } },
        analysisRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { id: true, outcome: true } },
        lines: { select: { id: true, position: true } },
        recommendations: { where: { productId: { not: null } }, select: { productId: true } },
      },
    });
    const run = fresh?.analysisRuns[0];
    if (!fresh || fresh.status !== "ANALYZED" || run?.id !== params.analysisRunId || fresh.counterFollowUp?.closedAt) return 0;
    const present = new Set(fresh.recommendations.map((row) => row.productId));
    const toAdd = params.merge.added.filter((item) => !present.has(item.productId));
    if (toAdd.length === 0) return 0;

    const opportunityIds = new Map<string, string>();
    for (const opportunity of params.merge.opportunities) {
      if (!toAdd.some((item) => item.opportunityKey === opportunity.key)) continue;
      const created = await tx.adviceOpportunity.create({
        data: {
          analysisRunId: run.id,
          category: opportunity.category,
          title: opportunity.title,
          benefits: opportunity.benefits ?? [],
          triggeredLineIds: opportunity.triggeredBy.flatMap((trigger) => fresh.lines.filter((line) => line.position === trigger.lineIndex).map((line) => line.id)),
          rationale: opportunity.rationale,
          clinicalContext: opportunity.clinicalContext,
          safetyNotes: opportunity.safetyNotes,
          priority: opportunity.priority,
          isBlocked: false,
          blockReason: null,
          needKey: opportunity.needKey ?? null,
          question: null,
          requiresConfirmation: false,
          aiJustification: opportunity.aiJustification ?? null,
          ruleKey: opportunity.ruleKey ?? null,
          ruleVersion: opportunity.ruleVersion ?? null,
          confirmedReason: null,
          coverage: "COVERED",
        },
        select: { id: true },
      });
      opportunityIds.set(opportunity.key, created.id);
    }
    for (const item of toAdd) {
      const created = await tx.recommendation.create({
        data: {
          pharmacyId: params.scope.pharmacyId,
          prescriptionId: params.prescriptionId,
          analysisRunId: run.id,
          opportunityId: opportunityIds.get(item.opportunityKey) ?? null,
          productId: item.productId,
          origin: "AI",
          status: "PROPOSED",
          scoreBreakdown: { ...item.breakdown, explanation: item.explanation } as never,
          totalScore: item.totalScore,
          justification: item.justification,
          shortReason: item.shortReason,
          patientReason: item.patientReason || null,
          counterScript: item.counterScript,
          precautions: item.precautions,
          vigilances: item.vigilances && item.vigilances.length > 0 ? (item.vigilances as never) : undefined,
          unitPriceCents: catalogById.get(item.productId)?.salePriceCents ?? 0,
          isDemo: fresh.isDemo,
        },
        select: { id: true },
      });
      await tx.recommendationEvent.create({ data: { recommendationId: created.id, type: "GENERATED", userId: null, metadata: { totalScore: item.totalScore, opportunity: item.opportunityKey, robot: true } as never } });
    }
    if (run.outcome !== "PROPOSALS") await tx.analysisRun.update({ where: { id: run.id }, data: { outcome: "PROPOSALS" } });
    return toAdd.length;
  });
}

/** Pour les tests : vide la mémoire des appels en cours. */
export function resetRobotInflightForTests(): void {
  inflight.clear();
}
