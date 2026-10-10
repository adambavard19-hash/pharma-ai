import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";
import type { PeriodRange } from "@/core/analytics/periods";
import { buildTeamRanking, type TeamRanking } from "@/core/team/ranking";
import { listMembers } from "@/server/services/comptoirs";
import { listRunningChallengesForPilotage } from "@/server/services/challenges";
import { COUNTER_DECLARED } from "@/server/services/counter-window";

/**
 * Le classement de l'équipe et l'avancement de chacun dans les challenges — la lecture de la page « Mon équipe ».
 *
 * Tout vient de la base, sur la période choisie : rien n'est reconstitué après coup, et rien n'est à entretenir. À la fin de l'année,
 * « cette année » donne le total de chacun. Une vente appartient à la personne du comptoir AU MOMENT du bip : attribuer le comptoir à un
 * autre plus tard ne réécrit jamais l'historique.
 */

export async function loadTeamRanking(scope: Pick<TenantScope, "pharmacyId" | "isDemo">, period: Pick<PeriodRange, "start" | "end">): Promise<TeamRanking> {
  const demo = Boolean(scope.isDemo);
  const [members, counts] = await Promise.all([
    listMembers(scope.pharmacyId),
    // Les conseils PharmaBoost (moteur ou règle) apparus sur les ventes de chacun, par statut. Les ajouts à la main ne sont pas des conseils de PharmaBoost.
    prisma.$queryRaw<{ userId: string | null; status: string; count: number }[]>`
      SELECT p."handledByUserId" AS "userId", r."status"::text AS "status", COUNT(*)::int AS "count"
      FROM "recommendations" r
      JOIN "prescriptions" p ON p."id" = r."prescriptionId"
      WHERE r."pharmacyId" = ${scope.pharmacyId}
        AND r."createdAt" >= ${period.start} AND r."createdAt" < ${period.end}
        AND r."origin" IN ('AI', 'RULE')
        AND p."deletedAt" IS NULL
        AND (r."isDemo" = ${demo} OR ${demo} = true)
      GROUP BY p."handledByUserId", r."status"`,
  ]);
  return buildTeamRanking(members.map((member) => ({ id: member.id, name: member.name })), counts);
}

export type TeamChallenge = {
  id: string;
  title: string;
  laboratory: string;
  endsOn: string;
  daysRemaining: number;
  /** L'objectif en unités, ou `null` quand le challenge n'en fixe pas. */
  target: number | null;
  units: number;
  /** Chacun et son total (ventes enregistrées + produits du challenge déclarés vendus au comptoir), du plus avancé au moins avancé. */
  people: { userId: string; name: string; units: number }[];
};

/**
 * Où en est chaque collaborateur dans chaque challenge en cours. S'ajoutent aux ventes enregistrées les produits du challenge que
 * le collaborateur a déclarés vendus à SON comptoir (le challenge vu par le pharmacien à cet instant est gardé dans l'historique du
 * conseil) : une déclaration n'est comptée qu'une fois, et seulement si elle n'est pas devenue une vente enregistrée.
 */
export async function loadTeamChallenges(scope: TenantScope): Promise<TeamChallenge[]> {
  const [challenges, members] = await Promise.all([listRunningChallengesForPilotage(scope), listMembers(scope.pharmacyId)]);
  if (challenges.length === 0) return [];
  const names = new Map(members.map((member) => [member.id, member.name]));
  const result: TeamChallenge[] = [];
  for (const challenge of challenges) {
    const declared = await prisma.recommendationEvent.findMany({
      where: {
        type: "PURCHASED",
        metadata: { path: ["challenge"], equals: challenge.title },
        recommendation: { pharmacyId: scope.pharmacyId, status: "PURCHASED", outcomeSource: COUNTER_DECLARED, saleLines: { none: {} }, decidedByUserId: { not: null } },
      },
      select: { recommendationId: true, recommendation: { select: { decidedByUserId: true, decidedAt: true, quantity: true } } },
    });
    // Une déclaration par conseil (reprise de réponse = plusieurs événements) et seulement dans la période du challenge.
    const periodStart = new Date(`${challenge.startsOn}T00:00:00.000Z`);
    const seen = new Set<string>();
    const perUser = new Map<string, number>(challenge.byCollaborator.filter((entry) => entry.key !== "none").map((entry) => [entry.key, entry.units]));
    let declaredTotal = 0;
    for (const event of declared) {
      if (seen.has(event.recommendationId)) continue;
      seen.add(event.recommendationId);
      const userId = event.recommendation.decidedByUserId;
      const at = event.recommendation.decidedAt;
      if (!userId || !at || at < periodStart) continue;
      const units = Math.max(1, event.recommendation.quantity ?? 1);
      perUser.set(userId, (perUser.get(userId) ?? 0) + units);
      declaredTotal += units;
    }
    const people = [...perUser.entries()].map(([userId, units]) => ({ userId, name: names.get(userId) ?? "Ancien collaborateur", units })).sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, "fr"));
    result.push({
      id: challenge.id,
      title: challenge.title,
      laboratory: challenge.laboratory,
      endsOn: challenge.endsOn,
      daysRemaining: challenge.progress.daysRemaining,
      target: challenge.progress.targetIsImplicit ? null : challenge.progress.target,
      units: challenge.progress.units + declaredTotal,
      people,
    });
  }
  return result;
}
