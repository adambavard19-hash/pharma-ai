import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";
import { TIME_ZONE } from "@/config/constants";
import { TEAM_ROLE_LABELS, type TeamRole } from "@/core/team/rules";
import { stockAgeDays, stockReminderLevel } from "@/core/stock-deposit/rules";
import { canManageTeam } from "@/core/personal/bonuses";
import { robotAlerts, type AlertInput, type RobotAlert } from "@/core/robot/alerts";
import type { TipChallenge } from "@/core/robot/mascot-tips";
import { listLots } from "@/server/services/stock-lots";
import { listJoinRequests } from "@/server/services/team-access";
import { countPharmacyUnread } from "@/server/services/support";
import { loadChallengeBoard, loadMyObjectives, loadTeamDesk } from "@/server/services/mobile/personal";
import { loadContinueCard } from "@/server/services/mobile/home";

/**
 * Ce que le robot du logiciel lit pour SIGNALER : des services existants, en lecture seule, toujours par la portée de
 * la session (officine ACTIVE, personne connectée) et selon ses permissions. Le choix et l'ordre des alertes sont dans
 * core/robot/alerts.ts. Une lecture qui échoue n'empêche rien : l'alerte correspondante se tait, c'est tout.
 */

export type AlertViewer = {
  scope: TenantScope;
  role: string;
  permissions: { manageTeam: boolean; updateStock: boolean; manageSettings: boolean };
  isDemo: boolean;
};

const SHORT_DATE_LOOKUP = 12;
/** Un objectif atteint reste une bonne nouvelle une semaine après sa fin. */
const OBJECTIVE_NEWS_DAYS = 7;
/** Un envoi de stock raté n'est signalé que s'il est récent et reste le dernier. */
const DEPOSIT_NEWS_DAYS = 14;

function localClock(now: Date): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "12");
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((part) => part.type === "weekday")?.value ?? "Mon");
  return { hour, weekday };
}

function recentEnough(endsOn: string, now: Date): boolean {
  return new Date(`${endsOn}T23:59:59Z`).getTime() >= now.getTime() - OBJECTIVE_NEWS_DAYS * 86_400_000;
}

const quiet = <T>(fallback: T) => (error: unknown) => {
  console.error("[robot] lecture impossible", error);
  return fallback;
};

export async function loadRobotAlerts(viewer: AlertViewer, now = new Date()): Promise<RobotAlert[]> {
  const { scope } = viewer;
  const owner = canManageTeam(viewer.role);
  const [pharmacy, board, lots, posts, joinRequests, desk, myObjectives, supportUnread, training, lastDeposit] = await Promise.all([
    prisma.pharmacy.findUnique({ where: { id: scope.pharmacyId }, select: { stockSyncedAt: true, organizationId: true, setupStatus: true, setupScheduledAt: true } }).catch(quiet(null)),
    loadChallengeBoard(scope, now).catch(quiet({ running: [], ended: [] })),
    listLots({ pharmacyId: scope.pharmacyId, userId: scope.userId }, { level: "URGENT", today: now }).catch(quiet(null)),
    prisma.counterPost
      .findMany({ where: { pharmacyId: scope.pharmacyId, pairedAt: { not: null }, revokedAt: null }, select: { id: true, label: true, hostname: true, lastSeenAt: true, assignedUserId: true }, orderBy: { createdAt: "asc" } })
      .catch(quiet([])),
    viewer.permissions.manageTeam ? listJoinRequests(scope.pharmacyId).catch(quiet([])) : Promise.resolve([]),
    owner ? loadTeamDesk(scope, now).catch(quiet(null)) : Promise.resolve(null),
    loadMyObjectives(scope, now).catch(quiet([])),
    countPharmacyUnread(scope.pharmacyId).catch(quiet(0)),
    loadContinueCard(scope.userId, scope, now).catch(quiet(null)),
    viewer.permissions.updateStock
      ? prisma.stockDeposit.findFirst({ where: { pharmacyId: scope.pharmacyId }, orderBy: { receivedAt: "desc" }, select: { id: true, status: true, receivedAt: true } }).catch(quiet(null))
      : Promise.resolve(null),
  ]);

  const subscription =
    viewer.permissions.manageSettings && pharmacy
      ? await prisma.subscription.findFirst({ where: { organizationId: pharmacy.organizationId }, orderBy: { createdAt: "desc" }, select: { status: true } }).catch(quiet(null))
      : null;

  const challenges: TipChallenge[] = board.running.map((c) => ({ id: c.id, title: c.title, teamUnits: c.teamUnits, milestones: c.milestones, target: c.target, daysRemaining: c.daysRemaining }));

  const input: AlertInput = {
    now,
    local: localClock(now),
    can: viewer.permissions,
    isDemo: viewer.isDemo,
    challenges,
    challengeHref: viewer.permissions.manageTeam ? "/equipe" : "/m/challenges",
    shortDates: (lots?.lots ?? []).filter((lot) => lot.daysLeft >= 0).slice(0, SHORT_DATE_LOOKUP).map((lot) => ({ label: lot.label, quantity: lot.quantity, daysLeft: lot.daysLeft })),
    stockStale: pharmacy ? stockReminderLevel(pharmacy.stockSyncedAt, now) !== "none" : false,
    stockAgeDays: pharmacy ? stockAgeDays(pharmacy.stockSyncedAt, now) : null,
    lastDeposit: lastDeposit && lastDeposit.receivedAt.getTime() >= now.getTime() - DEPOSIT_NEWS_DAYS * 86_400_000 ? lastDeposit : null,
    posts: posts.map((post, index) => ({ id: post.id, label: post.label?.trim() || post.hostname || `Comptoir ${index + 1}`, lastSeenAt: post.lastSeenAt, assignedToMe: post.assignedUserId === scope.userId })),
    joinRequests: joinRequests.map((request) => ({ id: request.id, name: request.name, suggestedRole: request.suggestedRole, roleLabel: TEAM_ROLE_LABELS[request.suggestedRole as TeamRole] ?? "Collaborateur" })),
    proposedBonuses: (desk?.bonuses ?? []).filter((bonus) => bonus.status === "PROPOSED").map((bonus) => ({ id: bonus.id, userName: bonus.userName, label: bonus.label })),
    myReachedObjectives: myObjectives.filter((o) => o.progress.state === "DONE" && recentEnough(o.endsOn, now)).map((o) => ({ id: o.id, title: o.title })),
    teamReachedObjectives: (desk?.objectives ?? []).filter((o) => o.userId !== scope.userId && o.progress.state === "DONE" && recentEnough(o.endsOn, now)).map((o) => ({ id: o.id, userName: o.userName, title: o.title })),
    supportUnread,
    subscription,
    setup: pharmacy?.setupStatus ? { status: pharmacy.setupStatus, scheduledAt: pharmacy.setupScheduledAt } : null,
    training: training ? { title: training.title, href: training.href, mode: training.mode, percent: training.percent } : null,
  };
  return robotAlerts(input);
}
