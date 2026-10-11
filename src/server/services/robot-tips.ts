import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";
import { TIME_ZONE } from "@/config/constants";
import { VALIDATED_STATUSES } from "@/core/team/ranking";
import { stockAgeDays, stockReminderLevel } from "@/core/stock-deposit/rules";
import { bestMoment, counterTips, mobileTip, type RobotTip, type TipChallenge } from "@/core/robot/mascot-tips";
import { listLots } from "@/server/services/stock-lots";
import { loadTeamRanking } from "@/server/services/team-ranking";
import { startOfParisDay } from "@/server/services/counter-dashboard";
import { loadChallengeBoard, loadMyBonuses, loadPersonalResults } from "@/server/services/mobile/personal";
import type { ContinueCard } from "@/server/services/mobile/home";

/**
 * Ce que le robot lit pour parler : des services existants, en lecture seule, TOUJOURS par la portée de la session
 * (officine active, personne connectée). Le choix de la phrase est dans core/robot/mascot-tips.ts.
 *
 * Aucune donnée de patient n'est lue ici ; aucun montant de challenge non plus (les paliers en unités seulement).
 */

/** Combien de lots en date courte la bulle regarde au plus (elle en cite deux). */
const SHORT_DATE_LOOKUP = 12;

function asTipChallenges(running: Awaited<ReturnType<typeof loadChallengeBoard>>["running"]): TipChallenge[] {
  return running.map((challenge) => ({
    id: challenge.id,
    title: challenge.title,
    teamUnits: challenge.teamUnits,
    milestones: challenge.milestones,
    target: challenge.target,
    daysRemaining: challenge.daysRemaining,
  }));
}

/**
 * Les phrases du robot sur « Nouvelle vente », dans l'ordre : challenge proche d'un palier, dates courtes, stock.
 * Une lecture qui échoue n'empêche jamais l'écran de s'afficher : le robot se tait, c'est tout.
 */
export async function loadCounterRobotTips(
  scope: TenantScope,
  options: { canUpdateStock: boolean; canSeeChallenges: boolean; isDemo: boolean; stockSyncedAt: Date | null; now?: Date },
): Promise<RobotTip[]> {
  const now = options.now ?? new Date();
  const [board, lots] = await Promise.all([
    loadChallengeBoard(scope, now).catch(() => ({ running: [], ended: [] })),
    listLots({ pharmacyId: scope.pharmacyId, userId: scope.userId }, { level: "URGENT", today: now }).catch(() => null),
  ]);
  return counterTips(
    {
      challenges: asTipChallenges(board.running),
      shortDates: (lots?.lots ?? []).filter((lot) => lot.daysLeft >= 0).slice(0, SHORT_DATE_LOOKUP).map((lot) => ({ label: lot.label, quantity: lot.quantity, daysLeft: lot.daysLeft })),
      stockAgeDays: stockAgeDays(options.stockSyncedAt, now),
      canUpdateStock: options.canUpdateStock && !options.isDemo,
      challengeHref: options.canSeeChallenges ? "/equipe" : null,
    },
    // La même règle que le rappel du stock existant : à partir de 3 jours, ou jamais envoyé.
    () => stockReminderLevel(options.stockSyncedAt, now) !== "none",
  );
}

/** La bulle de l'Accueil mobile : la prochaine étape la plus utile pour la personne (ou rien). */
export async function loadMobileRobotTip(scope: TenantScope | null, training: ContinueCard | null, now = new Date()): Promise<RobotTip | null> {
  const [bonuses, board] = scope
    ? await Promise.all([loadMyBonuses(scope).catch(() => []), loadChallengeBoard(scope, now).catch(() => ({ running: [], ended: [] }))])
    : [[], { running: [], ended: [] }];
  return mobileTip({
    bonuses,
    challenges: asTipChallenges(board.running),
    training: training ? { title: training.title, href: training.href, mode: training.mode, percent: training.percent } : null,
    now,
  });
}

export type DayRecap = {
  mine: { proposed: number; validated: number };
  team: { proposed: number; validated: number; people: number };
  /** Mon rang dans l'équipe aujourd'hui (null si je n'ai rien proposé). */
  myRank: number | null;
  best: { label: string; validated: number } | null;
};

/**
 * « Votre journée » : mes conseils proposés et validés aujourd'hui, ceux de l'équipe, et le meilleur moment (l'heure
 * où l'équipe a validé le plus). Mêmes règles que « Mon équipe » : conseils PharmaBoost (moteur ou règle) seulement.
 */
export async function loadDayRecap(scope: TenantScope, now = new Date()): Promise<DayRecap> {
  const start = startOfParisDay(now);
  const demo = Boolean(scope.isDemo);
  const validated = [...VALIDATED_STATUSES];
  const [personal, ranking, hours] = await Promise.all([
    loadPersonalResults(scope, now),
    loadTeamRanking(scope, { start, end: now }),
    prisma.$queryRaw<{ hour: number; validated: number }[]>`
      SELECT EXTRACT(HOUR FROM (r."decidedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TIME_ZONE}))::int AS "hour", COUNT(*)::int AS "validated"
      FROM "recommendations" r
      JOIN "prescriptions" p ON p."id" = r."prescriptionId"
      WHERE r."pharmacyId" = ${scope.pharmacyId}
        AND r."decidedAt" >= ${start} AND r."decidedAt" <= ${now}
        AND r."status"::text = ANY(${validated})
        AND r."origin" IN ('AI', 'RULE')
        AND p."deletedAt" IS NULL
        AND (r."isDemo" = ${demo} OR ${demo} = true)
      GROUP BY 1`,
  ]);
  const me = ranking.rows.find((row) => row.userId === scope.userId);
  const best = bestMoment(hours);
  return {
    mine: { proposed: personal.today.proposed, validated: personal.today.validated },
    team: { proposed: ranking.totals.proposed, validated: ranking.totals.validated, people: ranking.rows.filter((row) => row.userId !== null && row.proposed > 0).length },
    myRank: me && me.proposed > 0 ? me.rank : null,
    best: best ? { label: best.label, validated: best.validated } : null,
  };
}
