import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { reviewsByKey, ruleState, type RuleDecision, type RuleReviewRow, type RuleState } from "@/core/ai/rule-review";
import type { TenantScope } from "@/server/db/tenant";

/**
 * La relecture des règles de conseil par la pharmacienne : lecture pour le moteur, décision depuis l'écran.
 * Toute requête est bornée à l'officine du demandeur ; seule une règle qui existe vraiment peut être décidée.
 */

export async function loadRuleReviews(pharmacyId: string): Promise<RuleReviewRow[]> {
  const rows = await prisma.adviceRuleReview.findMany({ where: { pharmacyId }, select: { ruleKey: true, ruleVersion: true, decision: true } });
  return rows.map((row) => ({ ruleKey: row.ruleKey, ruleVersion: row.ruleVersion, decision: row.decision }));
}

export type RuleReviewView = {
  key: string;
  title: string;
  version: string;
  state: RuleState;
  decidedBy: string | null;
  decidedAt: Date | null;
  /** La règle a été relue sous une version plus ancienne : elle compte comme pas relue. */
  outdated: boolean;
};

/** L'état de chaque règle du moteur dans cette officine. */
export async function listRuleReviews(scope: TenantScope): Promise<RuleReviewView[]> {
  const rows = await prisma.adviceRuleReview.findMany({
    where: { pharmacyId: scope.pharmacyId },
    select: { ruleKey: true, ruleVersion: true, decision: true, decidedAt: true, decidedBy: { select: { firstName: true, lastName: true } } },
  });
  const reviews = reviewsByKey(rows.map((row) => ({ ruleKey: row.ruleKey, ruleVersion: row.ruleVersion, decision: row.decision })));
  const detail = new Map(rows.map((row) => [row.ruleKey, row]));
  return ADVICE_RULES.map((rule) => {
    const row = detail.get(rule.key);
    const state = ruleState(rule, reviews);
    return {
      key: rule.key,
      title: rule.title,
      version: rule.version,
      state,
      decidedBy: row && row.ruleVersion === rule.version && row.decidedBy ? `${row.decidedBy.firstName} ${row.decidedBy.lastName}` : null,
      decidedAt: row && row.ruleVersion === rule.version ? row.decidedAt : null,
      outdated: Boolean(row && row.ruleVersion !== rule.version),
    };
  });
}

/**
 * Valide ou refuse une règle pour l'officine ; `null` efface la décision. La décision est datée, signée du nom de
 * qui l'a prise, et porte sur la version actuelle de la règle.
 */
export async function setRuleDecision(scope: TenantScope, ruleKey: string, decision: RuleDecision | null): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const rule = ADVICE_RULES.find((candidate) => candidate.key === ruleKey);
  if (!rule) return { ok: false, error: "Règle de conseil inconnue." };
  if (decision === null) {
    await prisma.adviceRuleReview.deleteMany({ where: { pharmacyId: scope.pharmacyId, ruleKey } });
  } else {
    await prisma.adviceRuleReview.upsert({
      where: { pharmacyId_ruleKey: { pharmacyId: scope.pharmacyId, ruleKey } },
      create: { pharmacyId: scope.pharmacyId, ruleKey, ruleVersion: rule.version, decision, decidedByUserId: scope.userId },
      update: { ruleVersion: rule.version, decision, decidedByUserId: scope.userId, decidedAt: new Date() },
    });
  }
  await recordAudit({ action: "advice_rule.reviewed", entityType: "AdviceRule", entityId: ruleKey, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { ruleKey, ruleVersion: rule.version, decision } });
  return { ok: true, title: rule.title };
}
