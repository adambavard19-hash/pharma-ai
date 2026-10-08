import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma, UserRole } from "@/generated/prisma";
import { catalogDiffers, contractualPrice } from "@/core/billing/contract-price";
import { agentVersionState } from "@/core/admin/agent-version";
import {
  aiCostCents,
  connectorNeedsAttention,
  connectorState,
  countActiveSince,
  countPharmacyFilters,
  counterPostInError,
  counterPostState,
  invitationState,
  isInactivePharmacy,
  matchesPharmacySearch,
  matchesPharmacyStatus,
  pageCount,
  sortPharmacies,
  teamLastLogin,
  USERS_PAGE_SIZE,
  type PharmacyListFacts,
  type PharmacySort,
  type PharmacyStatusFilter,
  type UserStatusFilter,
  WATCH_FILTERS,
  type WatchFilter,
} from "@/core/admin/clients";
import { stockReminderLevel } from "@/core/stock-deposit/rules";

/**
 * Les lectures de l'espace « Clients » : officines, comptes, activité, accès,
 * état technique. Uniquement des faits d'entreprise (comptes, dates, statuts,
 * montants, volumes d'appels IA) : aucune table clinique n'est lue ici.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- Liste des officines

export type ClientPharmacyRow = PharmacyListFacts & {
  id: string;
  owner: { name: string; email: string } | null;
  memberCount: number;
  subscriptionView: { status: string; planName: string; priceCents: number; priceSource: "CONTRACT" | "CATALOG_FALLBACK"; catalogCents: number; catalogDiffers: boolean; cancelAtPeriodEnd: boolean; trialEndsAt: Date | null } | null;
  connector: ReturnType<typeof connectorState> & { lgo: string | null };
  /** Ce qui demande un regard (les démonstrations n'en font jamais partie) : voir `WATCH_FILTERS`. */
  watch: Record<WatchFilter, boolean>;
};

export async function listClientPharmacies(input: { q: string | null; statut: PharmacyStatusFilter | null; surveiller?: WatchFilter | null; tri: PharmacySort; now: Date }): Promise<{ rows: ClientPharmacyRow[]; counts: Record<PharmacyStatusFilter, number>; allCounts: Record<PharmacyStatusFilter, number>; total: number; searched: number; inactive: number; connectorsToCheck: number; watchCounts: Record<WatchFilter, number> }> {
  const pharmacies = await prisma.pharmacy.findMany({
    select: {
      id: true,
      name: true,
      city: true,
      siret: true,
      email: true,
      isActive: true,
      isDemo: true,
      createdAt: true,
      stockSyncedAt: true,
      stockConnection: { select: { lgo: true, status: true, lastSyncAt: true, lastSeenAt: true, intervalSeconds: true } },
      memberships: { where: { user: { deletedAt: null } }, select: { role: true, isActive: true, user: { select: { firstName: true, lastName: true, email: true, lastLoginAt: true } } } },
      organization: { select: { subscription: { select: { status: true, suspendedAt: true, contractPriceCents: true, cancelAtPeriodEnd: true, trialEndsAt: true, plan: { select: { name: true, monthlyPriceCents: true } } } } } },
    },
  });

  const all: ClientPharmacyRow[] = pharmacies.map((p) => {
    const sub = p.organization.subscription;
    const owner = p.memberships.find((m) => m.role === "OWNER" && m.isActive) ?? p.memberships.find((m) => m.role === "OWNER");
    const price = sub ? contractualPrice(sub, sub.plan) : null;
    const row: ClientPharmacyRow = {
      id: p.id,
      name: p.name,
      city: p.city,
      siret: p.siret,
      email: p.email,
      isActive: p.isActive,
      isDemo: p.isDemo,
      createdAt: p.createdAt,
      memberEmails: p.memberships.map((m) => m.user.email),
      subscription: sub ? { status: sub.status, suspendedAt: sub.suspendedAt } : null,
      // Comme le cockpit : seuls les accès ouverts comptent pour la dernière connexion de l'équipe.
      teamLastLoginAt: teamLastLogin(p.memberships.filter((m) => m.isActive).map((m) => m.user)),
      owner: owner ? { name: `${owner.user.firstName} ${owner.user.lastName.toUpperCase()}`, email: owner.user.email } : null,
      memberCount: p.memberships.filter((m) => m.isActive).length,
      subscriptionView: sub && price ? { status: sub.status, planName: sub.plan.name, priceCents: price.cents, priceSource: price.source, catalogCents: sub.plan.monthlyPriceCents, catalogDiffers: catalogDiffers(sub, sub.plan), cancelAtPeriodEnd: sub.cancelAtPeriodEnd, trialEndsAt: sub.trialEndsAt } : null,
      connector: { ...connectorState(p.stockConnection, input.now), lgo: p.stockConnection?.lgo ?? null },
      watch: { technique: false, inactives: false, stock: false },
    };
    const monitored = p.isActive && !p.isDemo;
    row.watch = {
      technique: monitored && connectorNeedsAttention(row.connector.state),
      inactives: isInactivePharmacy(row, input.now),
      stock: monitored && stockReminderLevel(p.stockSyncedAt, input.now) !== "none",
    };
    return row;
  });

  // Les compteurs des filtres suivent la recherche en cours, pas le filtre choisi.
  const searched = all.filter((row) => matchesPharmacySearch(row, input.q));
  const watched = input.surveiller ? searched.filter((row) => row.watch[input.surveiller as WatchFilter]) : searched;
  const rows = sortPharmacies(watched.filter((row) => matchesPharmacyStatus(row, input.statut)), input.tri);
  return {
    rows,
    counts: countPharmacyFilters(searched),
    // Les pastilles « À surveiller » : comptées sur toute la liste, comme les chiffres de l'accueil.
    watchCounts: Object.fromEntries(WATCH_FILTERS.map((filter) => [filter, all.filter((row) => row.watch[filter]).length])) as Record<WatchFilter, number>,
    allCounts: countPharmacyFilters(all),
    total: all.length,
    searched: searched.length,
    inactive: all.filter((row) => isInactivePharmacy(row, input.now)).length,
    // Les démonstrations ne comptent pas parmi les pannes (même règle que le cockpit et /admin/technique?filtre=erreurs).
    connectorsToCheck: all.filter((row) => !row.isDemo && connectorNeedsAttention(row.connector.state)).length,
  };
}

// ---------------------------------------------------------------- Comptes d'officine

/** Le filtre de statut d'un compte, traduit en requête (mêmes règles que `userAccessState`). */
export function userStatusWhere(filter: UserStatusFilter | null): Prisma.UserWhereInput {
  switch (filter) {
    case "actifs":
      return { status: "ACTIVE", OR: [{ memberships: { none: {} } }, { memberships: { some: { isActive: true } } }] };
    case "suspendus":
      return { status: { not: "DISABLED" }, OR: [{ status: "SUSPENDED" }, { AND: [{ memberships: { some: {} } }, { memberships: { none: { isActive: true } } }] }] };
    case "jamais-connectes":
      return { lastLoginAt: null, status: { not: "DISABLED" } };
    default:
      return {};
  }
}

export function userBaseWhere(input: { q: string | null; role: UserRole | null }): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [{ deletedAt: null }];
  if (input.q) {
    const contains = { contains: input.q, mode: "insensitive" as const };
    and.push({ OR: [{ email: contains }, { firstName: contains }, { lastName: contains }, { memberships: { some: { pharmacy: { name: contains } } } }] });
  }
  if (input.role) and.push({ memberships: { some: { role: input.role } } });
  return { AND: and };
}

export async function listPharmacyUsers(input: { q: string | null; role: UserRole | null; statut: UserStatusFilter | null; page: number }) {
  const base = userBaseWhere(input);
  const where: Prisma.UserWhereInput = { AND: [base, userStatusWhere(input.statut)] };
  const [total, all, actifs, suspendus, jamais, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: base }),
    prisma.user.count({ where: { AND: [base, userStatusWhere("actifs")] } }),
    prisma.user.count({ where: { AND: [base, userStatusWhere("suspendus")] } }),
    prisma.user.count({ where: { AND: [base, userStatusWhere("jamais-connectes")] } }),
    prisma.user.findMany({
      where,
      orderBy: [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (input.page - 1) * USERS_PAGE_SIZE,
      take: USERS_PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        memberships: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, isActive: true, isPrincipal: true, pharmacy: { select: { id: true, name: true, city: true, isActive: true, isDemo: true } } } },
      },
    }),
  ]);
  return { rows, total, pages: pageCount(total, USERS_PAGE_SIZE), counts: { all, actifs, suspendus, "jamais-connectes": jamais } };
}

// ---------------------------------------------------------------- Activité

export type ActivityRow = {
  id: string;
  name: string;
  city: string | null;
  isActive: boolean;
  teamLastLoginAt: Date | null;
  accounts: number;
  active7: number;
  active30: number;
  connector: ReturnType<typeof connectorState> & { lgo: string | null; lastSeenAt: Date | null };
  stockSyncedAt: Date | null;
  aiCalls30: number;
  aiFailed30: number;
  aiCostCents30: number;
  inactive: boolean;
};

/** L'usage par officine, hors démonstration : connexions, connecteur, stock, appels IA sur 30 jours. */
export async function loadClientActivity(now: Date): Promise<{ rows: ActivityRow[]; totals: { pharmacies: number; inactive: number; active7: number; accounts: number; aiCalls30: number; aiCostCents30: number } }> {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const [pharmacies, usage, failures] = await Promise.all([
    prisma.pharmacy.findMany({
      where: { isDemo: false },
      select: {
        id: true,
        name: true,
        city: true,
        isActive: true,
        isDemo: true,
        stockSyncedAt: true,
        stockConnection: { select: { lgo: true, status: true, lastSyncAt: true, lastSeenAt: true, intervalSeconds: true } },
        memberships: { where: { user: { deletedAt: null } }, select: { isActive: true, user: { select: { lastLoginAt: true } } } },
      },
    }),
    prisma.aiUsageRecord.groupBy({ by: ["pharmacyId"], where: { createdAt: { gte: since30 } }, _count: { _all: true }, _sum: { costMicroCents: true } }),
    prisma.aiUsageRecord.groupBy({ by: ["pharmacyId"], where: { createdAt: { gte: since30 }, succeeded: false }, _count: { _all: true } }),
  ]);
  const usageOf = new Map(usage.map((u) => [u.pharmacyId, u]));
  const failuresOf = new Map(failures.map((f) => [f.pharmacyId, f._count._all]));

  const rows: ActivityRow[] = pharmacies.map((p) => {
    // Seuls les accès ouverts comptent, pour la dernière connexion comme pour les effectifs (même définition que le cockpit).
    const users = p.memberships.filter((m) => m.isActive).map((m) => m.user);
    const lastLogin = teamLastLogin(users);
    const ai = usageOf.get(p.id);
    return {
      id: p.id,
      name: p.name,
      city: p.city,
      isActive: p.isActive,
      teamLastLoginAt: lastLogin,
      accounts: users.length,
      active7: countActiveSince(users, 7, now),
      active30: countActiveSince(users, 30, now),
      connector: { ...connectorState(p.stockConnection, now), lgo: p.stockConnection?.lgo ?? null, lastSeenAt: p.stockConnection?.lastSeenAt ?? null },
      stockSyncedAt: p.stockSyncedAt,
      aiCalls30: ai?._count._all ?? 0,
      aiFailed30: failuresOf.get(p.id) ?? 0,
      aiCostCents30: aiCostCents(ai?._sum.costMicroCents ?? 0),
      inactive: isInactivePharmacy({ isActive: p.isActive, isDemo: p.isDemo, teamLastLoginAt: lastLogin }, now),
    };
  });
  rows.sort((a, b) => (b.teamLastLoginAt?.getTime() ?? -1) - (a.teamLastLoginAt?.getTime() ?? -1) || a.name.localeCompare(b.name, "fr"));

  return {
    rows,
    totals: {
      pharmacies: rows.filter((r) => r.isActive).length,
      inactive: rows.filter((r) => r.inactive).length,
      active7: rows.reduce((sum, r) => sum + r.active7, 0),
      accounts: rows.reduce((sum, r) => sum + r.accounts, 0),
      aiCalls30: rows.reduce((sum, r) => sum + r.aiCalls30, 0),
      aiCostCents30: rows.reduce((sum, r) => sum + r.aiCostCents30, 0),
    },
  };
}

// ---------------------------------------------------------------- Accès

const ACCESS_EMAIL_KINDS = ["WELCOME", "ACCESS_LINK", "INVITATION"];
const FAILED_EMAIL_STATUSES = ["FAILED", "BOUNCED", "COMPLAINED", "SIMULATED"];

/** Officines et comptes suspendus, invitations en attente, e-mails d'accès en échec (30 jours). */
export async function loadAccessOverview(now: Date) {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const [suspendedPharmacies, suspendedMemberships, invitations, failedEmails] = await Promise.all([
    prisma.pharmacy.findMany({
      where: { OR: [{ isActive: false }, { organization: { subscription: { suspendedAt: { not: null } } } }] },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, city: true, isActive: true, isDemo: true, updatedAt: true, organization: { select: { subscription: { select: { status: true, suspendedAt: true, suspendedReason: true } } } } },
    }),
    prisma.membership.findMany({
      where: { user: { deletedAt: null }, OR: [{ isActive: false }, { user: { status: "SUSPENDED" } }] },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, role: true, isActive: true, updatedAt: true, pharmacy: { select: { id: true, name: true, isActive: true } }, user: { select: { id: true, firstName: true, lastName: true, email: true, status: true, lastLoginAt: true } } },
    }),
    prisma.pharmacyInvitation.findMany({
      // Comme le cockpit : les dossiers rattachés à une officine de démonstration n'y figurent pas.
      where: { completedAt: null, revokedAt: null, prospect: { OR: [{ pharmacyId: null }, { pharmacy: { isDemo: false } }] } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, email: true, expiresAt: true, sentAt: true, sendCount: true, lastSendStatus: true, lastSendDetail: true, openedAt: true, completedAt: true, revokedAt: true, createdAt: true, prospect: { select: { id: true, name: true, status: true, pharmacyId: true } } },
    }),
    prisma.emailDispatch.findMany({
      where: { kind: { in: ACCESS_EMAIL_KINDS }, status: { in: FAILED_EMAIL_STATUSES }, createdAt: { gte: since30 } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, kind: true, recipient: true, status: true, detail: true, createdAt: true, pharmacyId: true, prospectId: true },
    }),
  ]);

  // La dernière suspension de chaque officine : quand, par qui, pourquoi (journal d'audit).
  const pharmacyIds = suspendedPharmacies.map((p) => p.id);
  const suspensions = pharmacyIds.length
    ? await prisma.auditLog.findMany({
        where: { action: { in: ["billing.access_suspended", "platform.pharmacy_status_changed"] }, entityId: { in: pharmacyIds } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { entityId: true, action: true, metadata: true, createdAt: true, platformAdminId: true },
      })
    : [];
  const lastSuspension = new Map<string, (typeof suspensions)[number]>();
  for (const row of suspensions) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    // Une réactivation n'est pas une suspension.
    if (row.action === "platform.pharmacy_status_changed" && meta.isActive !== false) continue;
    if (row.entityId && !lastSuspension.has(row.entityId)) lastSuspension.set(row.entityId, row);
  }

  const names = await namesFor({
    adminIds: [...lastSuspension.values()].map((r) => r.platformAdminId),
    pharmacyIds: failedEmails.map((e) => e.pharmacyId),
    prospectIds: failedEmails.map((e) => e.prospectId),
  });

  return {
    suspendedPharmacies: suspendedPharmacies.map((p) => {
      const audit = lastSuspension.get(p.id);
      const meta = (audit?.metadata ?? {}) as Record<string, unknown>;
      return {
        ...p,
        suspendedAt: p.organization.subscription?.suspendedAt ?? audit?.createdAt ?? null,
        reason: p.organization.subscription?.suspendedReason ?? (typeof meta.reason === "string" ? meta.reason : null),
        by: audit?.platformAdminId ? (names.admins.get(audit.platformAdminId) ?? null) : null,
      };
    }),
    suspendedMemberships,
    invitations: invitations.map((inv) => ({ ...inv, state: invitationState(inv, now) })),
    failedEmails: failedEmails.map((e) => ({ ...e, pharmacyName: e.pharmacyId ? (names.pharmacies.get(e.pharmacyId) ?? null) : null, prospectName: e.prospectId ? (names.prospects.get(e.prospectId) ?? null) : null })),
  };
}

// ---------------------------------------------------------------- État technique

export async function loadTechnicalOverview(now: Date) {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const [connections, posts, incidents, resolvedRecently, aiTotals, aiFailed, aiByOperation, aiByPharmacy] = await Promise.all([
    prisma.stockConnection.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, lgo: true, status: true, agentVersion: true, hostname: true, lastSeenAt: true, lastSyncAt: true, lastSyncLines: true, lastError: true, pairedAt: true, intervalSeconds: true, pharmacy: { select: { id: true, name: true, city: true, isDemo: true, isActive: true } } },
    }),
    prisma.counterPost.findMany({
      where: { revokedAt: null },
      orderBy: [{ lastSeenAt: { sort: "desc", nulls: "last" } }],
      select: { id: true, hostname: true, label: true, version: true, lastSeenAt: true, lastScanAt: true, scanCount: true, lastExportAt: true, lastExportError: true, pairedAt: true, revokedAt: true, pharmacy: { select: { id: true, name: true, isDemo: true } } },
    }),
    prisma.platformIncident.findMany({ where: { resolvedAt: null }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.platformIncident.count({ where: { resolvedAt: { gte: since30 } } }),
    prisma.aiUsageRecord.aggregate({ where: { createdAt: { gte: since30 } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, costMicroCents: true } }),
    prisma.aiUsageRecord.count({ where: { createdAt: { gte: since30 }, succeeded: false } }),
    prisma.aiUsageRecord.groupBy({ by: ["operation"], where: { createdAt: { gte: since30 } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, costMicroCents: true } }),
    prisma.aiUsageRecord.groupBy({ by: ["pharmacyId"], where: { createdAt: { gte: since30 } }, _count: { _all: true }, _sum: { costMicroCents: true } }),
  ]);

  const topPharmacies = [...aiByPharmacy].sort((a, b) => b._count._all - a._count._all).slice(0, 8);
  const names = await namesFor({ pharmacyIds: [...incidents.map((i) => i.pharmacyId), ...topPharmacies.map((p) => p.pharmacyId)] });

  const connectors = connections.map((c) => {
    const state = connectorState(c, now);
    // Une officine de démonstration s'affiche, mais n'entre pas dans les erreurs à traiter (comme au cockpit).
    return { ...c, state, version: agentVersionState(c.agentVersion), needsAttention: !c.pharmacy.isDemo && connectorNeedsAttention(state.state) };
  });
  const counterPosts = posts.map((p) => ({ ...p, state: counterPostState(p, now), version: agentVersionState(p.version), inError: !p.pharmacy.isDemo && counterPostInError(p) }));

  return {
    connectors,
    counterPosts,
    incidents: incidents.map((i) => ({ ...i, pharmacyName: i.pharmacyId ? (names.pharmacies.get(i.pharmacyId) ?? null) : null })),
    resolvedRecently,
    ai: {
      calls: aiTotals._count._all,
      failed: aiFailed,
      inputTokens: aiTotals._sum.inputTokens ?? 0,
      outputTokens: aiTotals._sum.outputTokens ?? 0,
      costCents: aiCostCents(aiTotals._sum.costMicroCents ?? 0),
      byOperation: aiByOperation.map((o) => ({ operation: o.operation, calls: o._count._all, tokens: (o._sum.inputTokens ?? 0) + (o._sum.outputTokens ?? 0), costCents: aiCostCents(o._sum.costMicroCents ?? 0) })).sort((a, b) => b.calls - a.calls),
      topPharmacies: topPharmacies.map((p) => ({ pharmacyId: p.pharmacyId, name: names.pharmacies.get(p.pharmacyId) ?? "Officine supprimée", calls: p._count._all, costCents: aiCostCents(p._sum.costMicroCents ?? 0) })),
    },
  };
}

// ---------------------------------------------------------------- Noms

/** Les noms à afficher, en trois requêtes groupées au plus. */
export async function namesFor(input: { adminIds?: (string | null)[]; pharmacyIds?: (string | null)[]; prospectIds?: (string | null)[] }) {
  const unique = (values: (string | null)[] | undefined) => [...new Set((values ?? []).filter((v): v is string => Boolean(v)))];
  const adminIds = unique(input.adminIds);
  const pharmacyIds = unique(input.pharmacyIds);
  const prospectIds = unique(input.prospectIds);
  const [admins, pharmacies, prospects] = await Promise.all([
    adminIds.length ? prisma.platformAdmin.findMany({ where: { id: { in: adminIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
    pharmacyIds.length ? prisma.pharmacy.findMany({ where: { id: { in: pharmacyIds } }, select: { id: true, name: true } }) : [],
    prospectIds.length ? prisma.prospect.findMany({ where: { id: { in: prospectIds } }, select: { id: true, name: true } }) : [],
  ]);
  return {
    admins: new Map(admins.map((a) => [a.id, `${a.firstName} ${a.lastName}`])),
    pharmacies: new Map(pharmacies.map((p) => [p.id, p.name])),
    prospects: new Map(prospects.map((p) => [p.id, p.name])),
  };
}
