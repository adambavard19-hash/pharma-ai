import "server-only";
import { prisma } from "@/server/db/client";
import type { SessionContext } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadCounterDashboard } from "@/server/services/counter-dashboard";
import { loadChallengeBoard } from "@/server/services/mobile/personal";
import { listLots } from "@/server/services/stock-lots";
import { loadAttention, loadKpis, loadToday } from "@/server/services/admin/cockpit";
import { countSupportToAnswer } from "@/server/services/support";
import { getDirectorDashboard } from "@/server/services/sales/director-dashboard";
import { salesRepStats } from "@/server/services/sales/reps";
import { listTasks } from "@/server/services/sales/prospects";
import { DIRECTOR_PERIOD_LABELS } from "@/core/sales/director/dashboard";
import { describeWhen, ordonnanceTitle } from "@/core/counter/dashboard";
import { adminHome, directorHome, officineHome, salesHome, type IslandHome } from "@/core/island/home";

/**
 * L'onglet « Accueil » de l'île, espace par espace : les VRAIES données, lues avec la portée de la session (l'officine
 * active et la personne ; l'administrateur ; le directeur ; le commercial). Aucun nom de patient, aucun médicament :
 * une vente se dit par son numéro, son heure et son étape.
 */

const DAY_MS = 86_400_000;

export async function loadOfficineIslandHome(session: SessionContext, now = new Date()): Promise<IslandHome> {
  const canStock = session.permissions.has(PERMISSIONS.STOCK_VIEW);
  const [dashboard, board, lots] = await Promise.all([
    loadCounterDashboard(session.scope, now),
    loadChallengeBoard(session.scope, now).catch(() => ({ running: [] })),
    canStock ? listLots({ pharmacyId: session.scope.pharmacyId, userId: session.scope.userId }, { level: null, today: now }).catch(() => null) : Promise.resolve(null),
  ]);
  const challenge = board.running[0] ?? null;
  const post = dashboard.status.posts[0] ?? null;
  const last = dashboard.activity[0] ?? null;
  return officineHome({
    scanned: dashboard.stats.detected,
    accepted: dashboard.stats.accepted,
    salesCount: dashboard.stats.salesCount,
    attributedCents: dashboard.stats.attributedCents,
    counter: post ? { label: post.label, online: post.online } : null,
    challenge: challenge ? { title: challenge.title, teamUnits: challenge.teamUnits, target: challenge.target, toNext: challenge.unitsToNextMilestone } : null,
    shortDates: lots ? lots.counts.URGENT + lots.counts.EXPIRED : null,
    lastSale: last ? { title: ordonnanceTitle(last.reference), when: last.when, stage: last.stage.label, href: `/vente/${last.id}` } : null,
  });
}

export async function loadAdminIslandHome(now = new Date()): Promise<IslandHome> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const [attention, kpis, today, supportToAnswer, gapsOpen, setups, demosToday, demosWeek, newProspects] = await Promise.all([
    loadAttention(now),
    loadKpis({ value: "30j", days: 30 }, now),
    loadToday(now),
    countSupportToAnswer(),
    prisma.knowledgeGap.count({ where: { status: "OPEN" } }),
    prisma.pharmacy.count({ where: { isDemo: false, setupStatus: { in: ["TO_SCHEDULE", "SCHEDULED"] } } }),
    prisma.prospect.count({ where: { demoAt: { gte: startOfDay, lt: new Date(startOfDay.getTime() + DAY_MS) } } }),
    prisma.prospect.count({ where: { demoAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY_MS) }, demoDoneAt: null } }),
    prisma.prospect.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } } }),
  ]);
  return adminHome({
    activePharmacies: kpis.activePharmacies,
    mrrCents: kpis.mrrCents,
    paymentsLate: attention.paymentsLate,
    supportToAnswer,
    setupsToDo: setups,
    demosToday,
    demosWeek,
    newProspects7d: newProspects,
    postsOffline: attention.technical.total,
    contractsToCountersign: attention.contractsToCountersign,
    gapsOpen,
    today: today.slice(0, 4).map((item) => ({ id: item.id, title: item.title, when: describeWhen(item.at, now), href: item.href })),
  });
}

export async function loadDirectorIslandHome(directorId: string, now = new Date()): Promise<IslandHome> {
  const dashboard = await getDirectorDashboard(directorId, "mois", now);
  return directorHome({
    opened: dashboard.totals.opened,
    demos: dashboard.totals.demos,
    activated: dashboard.totals.activated,
    activeReps: dashboard.team.activeReps,
    applicationsToReview: dashboard.todo.applicationsToReview,
    unassignedProspects: dashboard.todo.unassignedProspects,
    commissionsToValidate: dashboard.todo.commissionsToValidate,
    invoicesToValidate: dashboard.todo.invoicesToValidate,
    periodLabel: DIRECTOR_PERIOD_LABELS.mois,
  });
}

export async function loadSalesIslandHome(salesRepId: string, now = new Date()): Promise<IslandHome> {
  const [stats, tasks, demos] = await Promise.all([
    salesRepStats(salesRepId),
    listTasks(salesRepId),
    prisma.prospect.findMany({ where: { salesRepId, demoAt: { gte: now }, demoDoneAt: null }, orderBy: { demoAt: "asc" }, take: 3, select: { id: true, name: true, demoAt: true } }),
  ]);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return salesHome({
    openProspects: stats.openProspects,
    activated: stats.activated,
    commissionEarnedCents: stats.commissionEarnedCents,
    commissionPendingCents: stats.commissionPendingCents,
    demosUpcoming: demos.map((demo) => ({ id: demo.id, name: demo.name, when: describeWhen(demo.demoAt!, now) })),
    tasksDue: [...tasks.late, ...tasks.today]
      .filter((task) => task.dueAt.getTime() <= endOfDay.getTime())
      .map((task) => ({ id: task.id, title: `${task.label} · ${task.prospect.name}`, when: describeWhen(task.dueAt, now), prospectId: task.prospectId })),
  });
}
