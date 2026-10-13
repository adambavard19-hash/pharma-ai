import "server-only";
import { prisma } from "@/server/db/client";
import { isRobotRuleKey, proposalIdOfRuleKey, robotRuleKey } from "@/core/ai/robot-suggestion";

/**
 * Les conseils du robot qui peuvent encore parler dans la fenêtre du comptoir : ceux dont la proposition existe et n'a pas
 * été refusée par la pharmacienne de PharmaBoost (console « Suggestions du robot »). Au moindre doute (base indisponible),
 * aucun. Module léger à dessein : la fenêtre du comptoir le lit toutes les deux secondes.
 */
export async function trustedRobotRuleKeys(ruleKeys: readonly (string | null | undefined)[]): Promise<Set<string>> {
  const keys = [...new Set(ruleKeys.filter(isRobotRuleKey))];
  if (keys.length === 0) return new Set();
  try {
    const rows = await prisma.robotRuleProposal.findMany({ where: { id: { in: keys.map(proposalIdOfRuleKey) }, status: { not: "REFUSED" } }, select: { id: true } });
    return new Set(rows.map((row) => robotRuleKey(row.id)));
  } catch {
    return new Set();
  }
}
