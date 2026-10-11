/**
 * La remontée vers la validation clinique centrale — règle pure.
 *
 * Quand un conseil est jugé « pas adapté à ce patient », on ne cherche pas la faute chez le pharmacien : c'est la RÈGLE
 * de conseil qu'on relit. Chaque officine a, par règle, au plus un signalement OUVERT (ou en cours de relecture) ; son
 * compte est le nombre de refus « inadapté » depuis le début de sa période. Une fois le signalement tranché par la
 * pharmacienne de PharmaBoost, seuls les refus postérieurs à sa décision en ouvrent un nouveau.
 *
 * Le calcul est idempotent : relancé dix fois sur les mêmes refus, il donne les mêmes comptes, jamais un double.
 */

export type ClinicalRefusal = { ruleKey: string; at: Date };
export type ExistingFlag = { id: string; ruleKey: string; status: string; count: number; periodStart: Date | null; reviewedAt: Date | null; createdAt: Date };

export type FlagPlan =
  | { kind: "create"; ruleKey: string; count: number; periodStart: Date; periodEnd: Date }
  | { kind: "update"; id: string; ruleKey: string; count: number; periodEnd: Date };

const OPEN = new Set(["OPEN", "UNDER_REVIEW"]);

export function planClinicalFlags(refusals: ClinicalRefusal[], flags: ExistingFlag[]): FlagPlan[] {
  const byRule = new Map<string, Date[]>();
  for (const refusal of refusals) byRule.set(refusal.ruleKey, [...(byRule.get(refusal.ruleKey) ?? []), refusal.at]);
  const plans: FlagPlan[] = [];
  for (const [ruleKey, dates] of byRule) {
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    const latest = flags.filter((flag) => flag.ruleKey === ruleKey).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (latest && OPEN.has(latest.status)) {
      const since = latest.periodStart?.getTime() ?? 0;
      const inPeriod = sorted.filter((date) => date.getTime() >= since);
      if (inPeriod.length > 0 && inPeriod.length !== latest.count) plans.push({ kind: "update", id: latest.id, ruleKey, count: inPeriod.length, periodEnd: inPeriod[inPeriod.length - 1] });
      continue;
    }
    const after = latest ? (latest.reviewedAt ?? latest.createdAt).getTime() : -Infinity;
    const fresh = sorted.filter((date) => date.getTime() > after);
    if (fresh.length > 0) plans.push({ kind: "create", ruleKey, count: fresh.length, periodStart: fresh[0], periodEnd: fresh[fresh.length - 1] });
  }
  return plans.sort((a, b) => a.ruleKey.localeCompare(b.ruleKey));
}
