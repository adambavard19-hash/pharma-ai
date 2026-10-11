import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { customRulesFrom } from "@/core/ai/central-advice";
import { COACH_WINDOW_DAYS, decideCoach, DISMISS_COOLDOWN_DAYS, REFUSAL_REASON_LABELS, universeOfCategory, type CoachAdvice, type CoachCandidate, type RefusalReason } from "@/core/coach/rules";
import { planClinicalFlags } from "@/core/coach/clinical";
import { narrate, ruleNarrator, type CoachNarrator } from "@/core/coach/narrator";
import { loadCentralRuleRows } from "@/server/services/central-advice";
import { mobileVisibleTrainingWhere } from "./home";

/**
 * Le coach de formation (v1, à règles) et la remontée clinique — la partie serveur.
 *
 * Entrées, et rien d'autre : les conseils PharmaBoost apparus sur les ventes de la personne connectée dans l'officine
 * ACTIVE (statut, motif de refus, univers, clé de règle), ses formations et ses quiz. Sorties : des suggestions de
 * formation dont la preuve (`evidence`) n'est faite que d'agrégats, et des signalements cliniques par règle.
 * Aucune donnée de patient n'est lue : ni ordonnance, ni nom, ni produit vendu à quelqu'un.
 */

const DAY = 86_400_000;

async function loadAdviceOf(scope: TenantScope, since: Date): Promise<CoachAdvice[]> {
  const rows = await prisma.recommendation.findMany({
    where: {
      pharmacyId: scope.pharmacyId,
      origin: { in: ["AI", "RULE"] },
      createdAt: { gte: since },
      prescription: { handledByUserId: scope.userId, deletedAt: null },
      ...(scope.isDemo ? {} : { isDemo: false }),
    },
    select: { status: true, declineReason: true, opportunity: { select: { category: true, ruleKey: true } }, product: { select: { category: true } } },
    take: 2000,
  });
  return rows.map((row) => ({
    status: row.status,
    reason: row.declineReason,
    universe: universeOfCategory(row.opportunity?.category, row.product?.category),
    ruleKey: row.opportunity?.ruleKey ?? null,
  }));
}

/**
 * Lance le coach pour la personne connectée : enregistre au plus une suggestion par univers (jamais deux fois la même
 * formation tant que la première est ouverte, ni une formation écartée depuis moins de 30 jours), puis met à jour les
 * signalements cliniques de l'officine. Rend le nombre de suggestions créées.
 */
export async function runCoach(scope: TenantScope, now = new Date(), narrator: CoachNarrator = ruleNarrator): Promise<{ created: number }> {
  const since = new Date(now.getTime() - COACH_WINDOW_DAYS * DAY);
  const [advice, progress, quizzes, existing] = await Promise.all([
    loadAdviceOf(scope, since),
    prisma.trainingProgress.findMany({
      where: { userId: scope.userId, OR: [{ pharmacyId: scope.pharmacyId }, { pharmacyId: null }] },
      select: { contentId: true, status: true, content: { select: { universe: true } } },
    }),
    prisma.quizAttempt.findMany({
      where: { userId: scope.userId, createdAt: { gte: new Date(now.getTime() - 180 * DAY) } },
      select: { score: true, content: { select: { universe: true } } },
      take: 500,
    }),
    prisma.trainingRecommendation.findMany({
      where: { userId: scope.userId, OR: [{ dismissedAt: null, completedAt: null }, { dismissedAt: { gte: new Date(now.getTime() - DISMISS_COOLDOWN_DAYS * DAY) } }] },
      select: { contentId: true, evidence: true, dismissedAt: true },
    }),
  ]);

  await syncClinicalFlags(scope.pharmacyId, now);
  if (advice.length === 0) return { created: 0 };

  const done = new Set(progress.filter((entry) => entry.status === "DONE").map((entry) => entry.contentId));
  const blockedContents = new Set(existing.map((row) => row.contentId).filter((id): id is string => Boolean(id)));
  const openUniverses = new Set(
    existing.filter((row) => !row.dismissedAt).map((row) => (row.evidence as { universe?: string } | null)?.universe).filter((value): value is string => Boolean(value)),
  );

  const contents = await prisma.trainingContent.findMany({
    where: { ...mobileVisibleTrainingWhere(scope, now), universe: { not: null } },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, title: true, universe: true },
    take: 300,
  });
  const candidates: CoachCandidate[] = contents
    .filter((content) => content.universe && !done.has(content.id) && !blockedContents.has(content.id) && !openUniverses.has(content.universe))
    .map((content) => ({ contentId: content.id, universe: content.universe as string, title: content.title }));

  const outcome = decideCoach({
    advice,
    trainings: progress.map((entry) => ({ universe: entry.content.universe, completed: entry.status === "DONE" })),
    quizzes: quizzes.map((attempt) => ({ universe: attempt.content.universe, score: attempt.score })),
    candidates,
  });

  let created = 0;
  for (const suggestion of outcome.suggestions) {
    const message = await narrate(suggestion, narrator);
    await prisma.trainingRecommendation.create({
      data: {
        userId: scope.userId,
        pharmacyId: scope.pharmacyId,
        contentId: suggestion.contentId,
        reason: "LOW_CONVERSION",
        evidence: { ...suggestion.evidence, message, engine: narrator.name },
      },
    });
    created += 1;
  }
  return { created };
}

export type TrainingSuggestionView = { id: string; contentId: string; title: string; universe: string | null; message: string; createdAt: Date };

/** Mes suggestions ouvertes. Une formation terminée depuis sort de la liste (et la suggestion est close). */
export async function listMyTrainingSuggestions(scope: TenantScope, now = new Date()): Promise<TrainingSuggestionView[]> {
  const rows = await prisma.trainingRecommendation.findMany({
    where: { userId: scope.userId, pharmacyId: scope.pharmacyId, dismissedAt: null, completedAt: null, content: mobileVisibleTrainingWhere(scope, now) },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, contentId: true, evidence: true, createdAt: true, content: { select: { title: true, universe: true, progress: { where: { userId: scope.userId, status: "DONE" }, select: { id: true } } } } },
  });
  const finished = rows.filter((row) => (row.content?.progress.length ?? 0) > 0).map((row) => row.id);
  if (finished.length > 0) await prisma.trainingRecommendation.updateMany({ where: { id: { in: finished }, userId: scope.userId }, data: { completedAt: now } });
  return rows
    .filter((row) => row.content && row.contentId && !finished.includes(row.id))
    .map((row) => ({
      id: row.id,
      contentId: row.contentId as string,
      title: row.content!.title,
      universe: row.content!.universe,
      message: String((row.evidence as { message?: unknown } | null)?.message ?? "Une formation qui peut vous aider."),
      createdAt: row.createdAt,
    }));
}

/** « Plus tard » : la suggestion disparaît et ne revient pas avant 30 jours. Seulement la sienne. */
export async function dismissTrainingSuggestion(userId: string, id: string, now = new Date()): Promise<boolean> {
  const result = await prisma.trainingRecommendation.updateMany({ where: { id, userId, dismissedAt: null }, data: { dismissedAt: now, seenAt: now } });
  return result.count > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Validation clinique centrale
// ---------------------------------------------------------------------------------------------------------------

const CLINICAL_REASON = "CLINICALLY_INAPPROPRIATE" as const;

/**
 * Met à jour les signalements d'une officine d'après ses refus « pas adapté à ce patient » des 180 derniers jours.
 * L'officine de démonstration ne remonte rien. Idempotent (voir `planClinicalFlags`).
 */
export async function syncClinicalFlags(pharmacyId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 180 * DAY);
  const refusals = await prisma.recommendation.findMany({
    where: { pharmacyId, declineReason: CLINICAL_REASON, isDemo: false, pharmacy: { isDemo: false }, updatedAt: { gte: since }, opportunity: { ruleKey: { not: null } } },
    select: { decidedAt: true, updatedAt: true, opportunity: { select: { ruleKey: true } } },
    take: 5000,
  });
  if (refusals.length === 0) return 0;
  const ruleKeys = [...new Set(refusals.map((row) => row.opportunity!.ruleKey as string))];
  const flags = await prisma.clinicalReviewFlag.findMany({
    where: { pharmacyId, reasonCode: CLINICAL_REASON, ruleKey: { in: ruleKeys } },
    select: { id: true, ruleKey: true, status: true, count: true, periodStart: true, reviewedAt: true, createdAt: true },
  });
  const plans = planClinicalFlags(
    refusals.map((row) => ({ ruleKey: row.opportunity!.ruleKey as string, at: row.decidedAt ?? row.updatedAt })),
    flags,
  );
  for (const plan of plans) {
    if (plan.kind === "update") {
      await prisma.clinicalReviewFlag.updateMany({ where: { id: plan.id, pharmacyId, status: { in: ["OPEN", "UNDER_REVIEW"] } }, data: { count: plan.count, periodEnd: plan.periodEnd } });
    } else {
      await prisma.clinicalReviewFlag.create({
        data: { ruleKey: plan.ruleKey, pharmacyId, count: plan.count, reasonCode: CLINICAL_REASON, reason: REFUSAL_REASON_LABELS[CLINICAL_REASON as RefusalReason], periodStart: plan.periodStart, periodEnd: plan.periodEnd },
      });
    }
  }
  return plans.length;
}

export type ClinicalFlagGroup = {
  ruleKey: string;
  ruleTitle: string;
  /** La règle existe encore (du code, ou ajoutée depuis la console). */
  known: boolean;
  count: number;
  pharmacies: number;
  reasons: string[];
  status: "OPEN" | "UNDER_REVIEW" | "CLOSED";
  firstAt: Date | null;
  lastAt: Date | null;
  lastDecision: { status: string; note: string | null; at: Date | null } | null;
};

const OPEN_STATUSES = ["OPEN", "UNDER_REVIEW"] as const;

/**
 * La liste de la console « Validation clinique » : par règle, le total des signalements ouverts, le nombre d'officines,
 * les motifs. Agrégée — aucune vente, aucun patient, aucun collaborateur. Derrière `requirePlatformSession` seulement.
 */
export async function listClinicalFlagGroups(): Promise<{ open: ClinicalFlagGroup[]; closed: ClinicalFlagGroup[] }> {
  const [flags, centralRows] = await Promise.all([
    prisma.clinicalReviewFlag.findMany({
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { ruleKey: true, pharmacyId: true, count: true, reason: true, status: true, periodStart: true, periodEnd: true, reviewedAt: true, resolutionNote: true, createdAt: true },
    }),
    loadCentralRuleRows(),
  ]);
  const titles = new Map<string, string>(ADVICE_RULES.map((rule) => [rule.key, rule.title]));
  for (const rule of customRulesFrom(centralRows.map((row) => ({ ...row, status: row.status === "REMOVED" ? "ACTIVE" : row.status })))) titles.set(rule.key, rule.title);

  const groups = new Map<string, { open: typeof flags; closed: typeof flags }>();
  for (const flag of flags) {
    const entry = groups.get(flag.ruleKey) ?? { open: [], closed: [] };
    ((OPEN_STATUSES as readonly string[]).includes(flag.status) ? entry.open : entry.closed).push(flag);
    groups.set(flag.ruleKey, entry);
  }
  const summarize = (ruleKey: string, list: typeof flags, status: ClinicalFlagGroup["status"], decided: typeof flags): ClinicalFlagGroup => {
    const lastDecided = decided.filter((flag) => flag.reviewedAt).sort((a, b) => b.reviewedAt!.getTime() - a.reviewedAt!.getTime())[0];
    const starts = list.map((flag) => flag.periodStart ?? flag.createdAt);
    const ends = list.map((flag) => flag.periodEnd ?? flag.createdAt);
    return {
      ruleKey,
      ruleTitle: titles.get(ruleKey) ?? ruleKey,
      known: titles.has(ruleKey),
      count: list.reduce((sum, flag) => sum + flag.count, 0),
      pharmacies: new Set(list.map((flag) => flag.pharmacyId ?? "—")).size,
      reasons: [...new Set(list.map((flag) => flag.reason))],
      status,
      firstAt: starts.length > 0 ? new Date(Math.min(...starts.map((date) => date.getTime()))) : null,
      lastAt: ends.length > 0 ? new Date(Math.max(...ends.map((date) => date.getTime()))) : null,
      lastDecision: lastDecided ? { status: lastDecided.status, note: lastDecided.resolutionNote, at: lastDecided.reviewedAt } : null,
    };
  };
  const open: ClinicalFlagGroup[] = [];
  const closed: ClinicalFlagGroup[] = [];
  for (const [ruleKey, entry] of groups) {
    if (entry.open.length > 0) open.push(summarize(ruleKey, entry.open, entry.open.some((flag) => flag.status === "UNDER_REVIEW") ? "UNDER_REVIEW" : "OPEN", entry.closed));
    else closed.push(summarize(ruleKey, entry.closed, "CLOSED", entry.closed));
  }
  open.sort((a, b) => b.count - a.count || b.pharmacies - a.pharmacies);
  closed.sort((a, b) => (b.lastDecision?.at?.getTime() ?? 0) - (a.lastDecision?.at?.getTime() ?? 0));
  return { open, closed: closed.slice(0, 30) };
}

export const CLINICAL_DECISIONS = ["UNDER_REVIEW", "CONFIRMED_OK", "RULE_CHANGED", "DISMISSED"] as const;
export type ClinicalDecision = (typeof CLINICAL_DECISIONS)[number];

/** La décision de la validation clinique sur une règle : s'applique à tous ses signalements ouverts. */
export async function decideClinicalFlags(admin: { id: string }, ruleKey: string, decision: ClinicalDecision, note: string | null, now = new Date()): Promise<number> {
  const closing = decision !== "UNDER_REVIEW";
  const result = await prisma.clinicalReviewFlag.updateMany({
    where: { ruleKey, status: { in: [...OPEN_STATUSES] } },
    data: closing ? { status: decision, reviewedByAdminId: admin.id, reviewedAt: now, resolutionNote: note } : { status: decision, reviewedByAdminId: admin.id, resolutionNote: note },
  });
  return result.count;
}

/** Le motif d'un « Non vendu » saisi sur l'écran de la vente : on n'écrit QUE sur un conseil refusé de cette officine. */
export async function setDeclineReason(scope: Pick<TenantScope, "pharmacyId">, recommendationId: string, reason: RefusalReason | null, now = new Date()): Promise<boolean> {
  const result = await prisma.recommendation.updateMany({
    where: { id: recommendationId, pharmacyId: scope.pharmacyId, status: { in: ["DECLINED", "IGNORED", "REMOVED"] } },
    data: { declineReason: reason },
  });
  if (result.count > 0 && reason === CLINICAL_REASON) await syncClinicalFlags(scope.pharmacyId, now);
  return result.count > 0;
}
