import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { todayRange } from "@/core/admin/metrics";
import type { ProspectStatusCode } from "@/core/sales/pipeline";
import { ACTIVITY_EVENT_TYPES, ACTIVITY_LIMIT, REASSIGN_MAX, activitySince, deletionRefusal, parisMonthStart, teamSearchWhere, type RepFootprint, type TeamStatusFilter } from "@/core/sales/director/team";
import { recordProspectEvent } from "./events";
import { countByRep, firstActivationByProspect, firstDemoDoneByProspect } from "./first-events";
import { notifySalesRep } from "./notifications";
import { createSalesRep, salesRepStats, sendSalesInvitation, updateSalesRep, type SalesRepInput } from "./reps";
import type { RepActor } from "./rep-actor";
import type { Prisma } from "@/generated/prisma";

/**
 * L'équipe commerciale, côté directeur : la liste des commerciaux, la fiche de
 * chacun, l'ajout, la modification, la désactivation, la suppression et la
 * réaffectation des dossiers.
 *
 * Règles qui valent pour toutes les fonctions :
 *   - l'identité du directeur (`director`) vient de SA session, jamais d'un
 *     formulaire ; chaque geste est tracé dans l'audit (`salesDirectorId`) ;
 *   - tout identifiant reçu est relu en base avant d'agir ;
 *   - le directeur est un compte de la plateforme : aucune donnée d'officine
 *     ni de patient ici, seulement des dossiers commerciaux (jamais leurs
 *     contrats ni leurs pièces).
 */

/** Le directeur qui agit, tel que sa session le décrit. */
export type DirectorRef = { id: string; label: string };

const asActor = (director: DirectorRef): RepActor => ({ type: "DIRECTOR", id: director.id, label: director.label });

const CLOSED = ["ACTIVATED", "LOST"] as const;
const fullName = (rep: { firstName: string; lastName: string }) => `${rep.firstName} ${rep.lastName}`.trim();

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export type TeamRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  zone: string | null;
  commissionType: "FIXED" | "PERCENT" | "RECURRING";
  commissionValue: number;
  isActive: boolean;
  invitedAt: Date | null;
  lastLoginAt: Date | null;
  openProspects: number;
  /** Les officines passées « Activées » ce mois-ci (heure de Paris) sur ses dossiers. */
  activationsThisMonth: number;
};

export type TeamList = {
  rows: TeamRow[];
  /** Compteurs de la recherche en cours ; le filtre actifs / inactifs ne les réduit pas. */
  counts: { all: number; active: number; inactive: number };
  /** Les commerciaux, sans aucun filtre : distingue « aucun commercial » de « aucun résultat ». */
  grandTotal: number;
};

/**
 * Les officines activées par commercial dans l'intervalle [from, to[. Même
 * source et même règle que les challenges et le tableau de bord : l'événement
 * daté de la PREMIÈRE activation de l'officine, comptée une seule fois.
 */
export async function activationsByRep(salesRepIds: string[], from: Date, to: Date): Promise<Map<string, number>> {
  return countByRep(await firstActivationByProspect(salesRepIds, { gte: from, lt: to }));
}

export async function listTeam(filter: { q: string; status: TeamStatusFilter | null }, now: Date = new Date()): Promise<TeamList> {
  const search = teamSearchWhere(filter.q);
  const where: Prisma.SalesRepWhereInput = filter.status ? { ...search, isActive: filter.status === "actifs" } : search;
  const [grouped, reps, grandTotal] = await Promise.all([
    prisma.salesRep.groupBy({ by: ["isActive"], where: search, _count: { _all: true } }),
    prisma.salesRep.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, zone: true, commissionType: true, commissionValue: true, isActive: true, invitedAt: true, lastLoginAt: true },
    }),
    prisma.salesRep.count(),
  ]);
  const active = grouped.find((row) => row.isActive)?._count._all ?? 0;
  const inactive = grouped.find((row) => !row.isActive)?._count._all ?? 0;

  const ids = reps.map((rep) => rep.id);
  const [open, activations] =
    ids.length === 0
      ? [[], new Map<string, number>()]
      : await Promise.all([
          prisma.prospect.groupBy({ by: ["salesRepId"], where: { salesRepId: { in: ids }, status: { notIn: [...CLOSED] } }, _count: { _all: true } }),
          activationsByRep(ids, parisMonthStart(now), now),
        ]);
  const openBy = new Map(open.map((row) => [row.salesRepId, row._count._all]));

  return {
    rows: reps.map((rep) => ({ ...rep, openProspects: openBy.get(rep.id) ?? 0, activationsThisMonth: activations.get(rep.id) ?? 0 })),
    counts: { all: active + inactive, active, inactive },
    grandTotal,
  };
}

/** Les commerciaux auxquels on peut confier un dossier : les actifs, par ordre alphabétique. */
export async function listAssignableReps(): Promise<{ id: string; name: string }[]> {
  const reps = await prisma.salesRep.findMany({ where: { isActive: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true } });
  return reps.map((rep) => ({ id: rep.id, name: fullName(rep) }));
}

export type UnassignedProspect = { id: string; name: string; city: string | null; status: ProspectStatusCode; createdAt: Date; formerRepName: string | null };

/**
 * Un dossier ouvert que personne ne suit vraiment : aucun commercial (console,
 * site), OU un commercial désactivé (son dossier ne doit pas rester enfermé chez
 * quelqu'un qui ne peut plus le traiter). Le tableau de bord compte la même chose.
 */
export const UNASSIGNED_PROSPECT_WHERE: Prisma.ProspectWhereInput = { status: { notIn: [...CLOSED] }, OR: [{ salesRepId: null }, { salesRep: { isActive: false } }] };

/** Les dossiers ouverts sans commercial actif, à attribuer ; ceux d'un ancien commercial le disent. */
export async function listUnassignedProspects(limit = 50): Promise<{ rows: UnassignedProspect[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.prospect.findMany({
      where: UNASSIGNED_PROSPECT_WHERE,
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      select: { id: true, name: true, city: true, status: true, createdAt: true, salesRep: { select: { firstName: true, lastName: true } } },
    }),
    prisma.prospect.count({ where: UNASSIGNED_PROSPECT_WHERE }),
  ]);
  return { rows: rows.map(({ salesRep, ...row }) => ({ ...row, status: row.status as ProspectStatusCode, formerRepName: salesRep ? fullName(salesRep) : null })), total };
}

// ---------------------------------------------------------------------------
// Fiche
// ---------------------------------------------------------------------------

async function repFootprint(salesRepId: string): Promise<RepFootprint> {
  const [prospects, commissions, invoices, tasks] = await Promise.all([
    prisma.prospect.count({ where: { salesRepId } }),
    prisma.commission.count({ where: { salesRepId } }),
    prisma.salesInvoice.count({ where: { salesRepId } }),
    prisma.salesTask.count({ where: { salesRepId } }),
  ]);
  return { prospects, commissions, invoices, tasks };
}

export type TeamMember = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  zone: string | null;
  commissionType: "FIXED" | "PERCENT" | "RECURRING";
  commissionValue: number;
  isActive: boolean;
  invitedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export type TeamMemberOverview = {
  member: TeamMember;
  stats: Awaited<ReturnType<typeof salesRepStats>>;
  /** Ce qui s'oppose à une suppression définitive (vide : suppression possible). */
  footprint: RepFootprint;
  deletionRefusal: string | null;
};

/** L'en-tête de la fiche d'un commercial : son identité, ses chiffres, et ce qui retient une suppression. `null` s'il n'existe pas. */
export async function getTeamMember(salesRepId: string): Promise<TeamMemberOverview | null> {
  const rep = await prisma.salesRep.findUnique({
    where: { id: salesRepId },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, zone: true, commissionType: true, commissionValue: true, isActive: true, invitedAt: true, lastLoginAt: true, createdAt: true },
  });
  if (!rep) return null;
  const [stats, footprint] = await Promise.all([salesRepStats(rep.id), repFootprint(rep.id)]);
  return { member: { ...rep, name: fullName(rep) }, stats, footprint, deletionRefusal: deletionRefusal(footprint) };
}

export type PortfolioProspect = {
  id: string;
  name: string;
  city: string | null;
  status: ProspectStatusCode;
  nextActionAt: Date | null;
  nextActionLabel: string | null;
  lastContactAt: Date | null;
  monthlyPriceCents: number | null;
  blocked: boolean;
};

export const PORTFOLIO_LIMIT = 500;

/** Les dossiers du commercial : officine, ville, étape, prochaine action, dernier contact, prix. Jamais les contrats ni les pièces. */
export async function getPortfolio(salesRepId: string): Promise<{ prospects: PortfolioProspect[]; truncated: boolean }> {
  const rows = await prisma.prospect.findMany({
    where: { salesRepId },
    orderBy: [{ updatedAt: "desc" }],
    take: PORTFOLIO_LIMIT + 1,
    select: { id: true, name: true, city: true, status: true, nextActionAt: true, nextActionLabel: true, lastContactAt: true, monthlyPriceCents: true, blockedAt: true },
  });
  return {
    prospects: rows.slice(0, PORTFOLIO_LIMIT).map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      status: row.status as ProspectStatusCode,
      nextActionAt: row.nextActionAt,
      nextActionLabel: row.nextActionLabel,
      lastContactAt: row.lastContactAt,
      monthlyPriceCents: row.monthlyPriceCents,
      blocked: row.blockedAt !== null,
    })),
    truncated: rows.length > PORTFOLIO_LIMIT,
  };
}

export type TeamMemberActivity = {
  since: Date;
  events: { id: string; type: string; summary: string; actorType: string; actorLabel: string | null; createdAt: Date; prospect: { id: string; name: string } }[];
  tasksDone: number;
  overdueTasks: { id: string; label: string; dueAt: Date; prospect: { id: string; name: string } }[];
  demosDone: number;
  demosUpcoming: number;
};

/**
 * Ce que le commercial a fait ces 30 derniers jours : les événements qu'il a
 * lui-même posés ou qui ont touché ses dossiers (hors contrats et e-mails),
 * ses relances faites et en retard, ses démonstrations.
 */
export async function getActivity(salesRepId: string, now: Date = new Date()): Promise<TeamMemberActivity> {
  const since = activitySince(now);
  const [events, tasksDone, overdueTasks, demosDone, demosUpcoming] = await Promise.all([
    prisma.prospectEvent.findMany({
      where: {
        createdAt: { gte: since },
        type: { in: [...ACTIVITY_EVENT_TYPES] },
        OR: [{ actorType: "SALES", actorId: salesRepId }, { actorType: { not: "SALES" }, prospect: { salesRepId } }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ACTIVITY_LIMIT,
      select: { id: true, type: true, summary: true, actorType: true, actorLabel: true, createdAt: true, prospect: { select: { id: true, name: true } } },
    }),
    prisma.salesTask.count({ where: { salesRepId, doneAt: { gte: since } } }),
    prisma.salesTask.findMany({ where: { salesRepId, doneAt: null, dueAt: { lt: todayRange(now).start } }, orderBy: [{ dueAt: "asc" }], take: 10, select: { id: true, label: true, dueAt: true, prospect: { select: { id: true, name: true } } } }),
    firstDemoDoneByProspect([salesRepId], { gte: since }).then((done) => done.length),
    prisma.prospect.count({ where: { salesRepId, demoDoneAt: null, demoAt: { gte: now } } }),
  ]);
  return { since, events, tasksDone, overdueTasks, demosDone, demosUpcoming };
}

export type TeamMemberMoney = {
  commissions: { id: string; prospectName: string; amountCents: number; status: string; type: string; createdAt: Date; paidAt: Date | null; invoiceId: string | null }[];
  commissionsTruncated: boolean;
  invoices: { id: string; number: string; amountCents: number; issuedAt: Date; status: string; periodLabel: string | null }[];
  invoicesTruncated: boolean;
};

const MONEY_LIMIT = 30;

/** Ses commissions et ses factures, les plus récentes d'abord. Le détail et les gestes vivent dans les pages Commissions et Factures. */
export async function getMoney(salesRepId: string): Promise<TeamMemberMoney> {
  const [commissions, invoices] = await Promise.all([
    prisma.commission.findMany({
      where: { salesRepId },
      orderBy: [{ createdAt: "desc" }],
      take: MONEY_LIMIT + 1,
      select: { id: true, amountCents: true, status: true, type: true, createdAt: true, paidAt: true, invoiceId: true, prospect: { select: { name: true } } },
    }),
    prisma.salesInvoice.findMany({
      where: { salesRepId },
      orderBy: [{ issuedAt: "desc" }],
      take: MONEY_LIMIT + 1,
      select: { id: true, number: true, amountCents: true, issuedAt: true, status: true, periodLabel: true },
    }),
  ]);
  return {
    commissions: commissions.slice(0, MONEY_LIMIT).map((row) => ({ id: row.id, prospectName: row.prospect.name, amountCents: row.amountCents, status: row.status, type: row.type, createdAt: row.createdAt, paidAt: row.paidAt, invoiceId: row.invoiceId })),
    commissionsTruncated: commissions.length > MONEY_LIMIT,
    invoices: invoices.slice(0, MONEY_LIMIT),
    invoicesTruncated: invoices.length > MONEY_LIMIT,
  };
}

// ---------------------------------------------------------------------------
// Ajouter
// ---------------------------------------------------------------------------

export type InvitationOutcome = { status: string; detail: string };

/**
 * Envoie l'invitation et dit ce qui s'est passé, tel quel. Si le message n'est
 * pas parti (prestataire en panne, envoi simulé), la date « invité le »
 * n'est pas conservée : la fiche ne prétend jamais qu'une invitation est partie
 * quand elle ne l'est pas.
 */
export async function sendInvitationHonestly(salesRepId: string, actor: RepActor): Promise<InvitationOutcome> {
  const before = await prisma.salesRep.findUnique({ where: { id: salesRepId }, select: { invitedAt: true } });
  let outcome: InvitationOutcome;
  try {
    outcome = await sendSalesInvitation(salesRepId, actor);
  } catch {
    // Le commercial existe ; seule l'invitation a échoué, et sa fiche permet de la renvoyer.
    return { status: "FAILED", detail: "l'envoi a échoué, renvoyez l'invitation depuis la fiche du commercial" };
  }
  if (outcome.status !== "SENT") {
    await prisma.salesRep.update({ where: { id: salesRepId }, data: { invitedAt: before?.invitedAt ?? null } }).catch(() => undefined);
  }
  return outcome;
}

/**
 * Une invitation qui n'est pas partie (transformation d'une candidature : le
 * service existant date l'invitation avant de connaître l'issue) ne laisse pas
 * de date « invité le ». Seul un commercial qui ne s'est jamais connecté est
 * concerné : sa connexion prouverait que l'accès marche.
 */
export async function forgetUnsentInvitation(salesRepId: string): Promise<void> {
  await prisma.salesRep.updateMany({ where: { id: salesRepId, lastLoginAt: null }, data: { invitedAt: null } });
}

export type CreateMemberResult = { ok: true; id: string; name: string; invitation: InvitationOutcome | null } | { ok: false; reason: "EMAIL_TAKEN" };

/**
 * Ajoute un commercial depuis l'espace du directeur : même table que la
 * console (il apparaît des deux côtés), même invitation par e-mail. L'adresse
 * est l'identifiant : une adresse déjà prise est refusée.
 */
export async function createTeamMember(input: SalesRepInput, director: DirectorRef, options: { invite: boolean }): Promise<CreateMemberResult> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.salesRep.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, reason: "EMAIL_TAKEN" };

  const actor = asActor(director);
  let created: { id: string };
  try {
    created = await createSalesRep({ ...input, email, isActive: true }, actor);
  } catch (error) {
    // Deux ajouts simultanés : l'adresse est le verrou.
    if (isUniqueViolation(error)) return { ok: false, reason: "EMAIL_TAKEN" };
    throw error;
  }
  const invitation = options.invite ? await sendInvitationHonestly(created.id, actor) : null;
  return { ok: true, id: created.id, name: fullName(input), invitation };
}

// ---------------------------------------------------------------------------
// Modifier, désactiver, inviter
// ---------------------------------------------------------------------------

export type TeamMemberPatch = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  zone?: string | null;
  commissionType?: "FIXED" | "PERCENT" | "RECURRING";
  commissionValue?: number;
};

export type SimpleResult = { ok: true } | { ok: false; reason: "NOT_FOUND" };

/**
 * Modifie l'identité d'un commercial (prénom, nom, téléphone, zone) et sa
 * commission. L'e-mail, qui est son identifiant de connexion, ne change pas
 * ici. Une nouvelle commission ne vaut que pour les prochains contrats : les
 * commissions déjà créées gardent leur montant.
 */
export async function updateTeamMember(salesRepId: string, patch: TeamMemberPatch, director: DirectorRef): Promise<SimpleResult> {
  const rep = await prisma.salesRep.findUnique({ where: { id: salesRepId }, select: { id: true } });
  if (!rep) return { ok: false, reason: "NOT_FOUND" };
  const data: Partial<SalesRepInput> = {};
  if (patch.firstName !== undefined) data.firstName = patch.firstName.trim();
  if (patch.lastName !== undefined) data.lastName = patch.lastName.trim();
  if (patch.phone !== undefined) data.phone = patch.phone?.trim() || null;
  if (patch.zone !== undefined) data.zone = patch.zone?.trim() || null;
  if (patch.commissionType !== undefined) data.commissionType = patch.commissionType;
  if (patch.commissionValue !== undefined) data.commissionValue = patch.commissionValue;
  await updateSalesRep(salesRepId, data, asActor(director));
  return { ok: true };
}

export type ActiveResult = { ok: true; changed: boolean; openProspects: number } | { ok: false; reason: "NOT_FOUND" };

/**
 * Désactive (réversible : ses sessions sont révoquées, il ne peut plus se
 * connecter) ou réactive un commercial. Ses dossiers restent à son nom : la
 * réponse dit combien sont encore ouverts, pour qu'on les réaffecte.
 */
export async function setTeamMemberActive(salesRepId: string, active: boolean, director: DirectorRef): Promise<ActiveResult> {
  const rep = await prisma.salesRep.findUnique({ where: { id: salesRepId }, select: { id: true, isActive: true } });
  if (!rep) return { ok: false, reason: "NOT_FOUND" };
  const openProspects = await prisma.prospect.count({ where: { salesRepId, status: { notIn: [...CLOSED] } } });
  if (rep.isActive === active) return { ok: true, changed: false, openProspects };
  await updateSalesRep(salesRepId, { isActive: active }, asActor(director));
  return { ok: true, changed: true, openProspects };
}

export type InviteResult = { ok: true; invitation: InvitationOutcome } | { ok: false; reason: "NOT_FOUND" | "INACTIVE" };

/** Envoie ou renvoie l'invitation d'un commercial actif ; l'issue de l'envoi est rendue telle quelle. */
export async function resendTeamInvitation(salesRepId: string, director: DirectorRef): Promise<InviteResult> {
  const rep = await prisma.salesRep.findUnique({ where: { id: salesRepId }, select: { id: true, isActive: true } });
  if (!rep) return { ok: false, reason: "NOT_FOUND" };
  if (!rep.isActive) return { ok: false, reason: "INACTIVE" };
  return { ok: true, invitation: await sendInvitationHonestly(rep.id, asActor(director)) };
}

// ---------------------------------------------------------------------------
// Supprimer
// ---------------------------------------------------------------------------

export type DeleteResult = { ok: true } | { ok: false; reason: "NOT_FOUND" } | { ok: false; reason: "HAS_HISTORY"; message: string; footprint: RepFootprint };

/**
 * Supprime DÉFINITIVEMENT un commercial, seulement s'il n'a aucun dossier,
 * aucune commission, aucune facture et aucune tâche. Sinon : refus, et la
 * désactivation (réversible) reste la bonne voie. La base ne retient pas les
 * dossiers (elle les détacherait en silence) : la suppression est donc une
 * seule instruction conditionnée à l'absence d'historique, pas un contrôle
 * suivi d'un effacement.
 */
export async function deleteTeamMember(salesRepId: string, director: DirectorRef): Promise<DeleteResult> {
  const rep = await prisma.salesRep.findUnique({ where: { id: salesRepId }, select: { id: true, email: true } });
  if (!rep) return { ok: false, reason: "NOT_FOUND" };

  const refuse = async (): Promise<DeleteResult> => {
    const footprint = await repFootprint(salesRepId);
    return { ok: false, reason: "HAS_HISTORY", message: deletionRefusal(footprint) ?? "Ce commercial a un historique : désactivez-le ou réaffectez ses dossiers.", footprint };
  };

  const before = await repFootprint(salesRepId);
  if (deletionRefusal(before)) return refuse();

  const deleted = await prisma.salesRep.deleteMany({ where: { id: salesRepId, prospects: { none: {} }, commissions: { none: {} }, invoices: { none: {} }, tasks: { none: {} } } });
  if (deleted.count === 0) {
    // Un dossier est arrivé entre-temps (ou le commercial a déjà disparu).
    const still = await prisma.salesRep.findUnique({ where: { id: salesRepId }, select: { id: true } });
    return still ? refuse() : { ok: false, reason: "NOT_FOUND" };
  }
  await recordAudit({ action: "sales.rep_deleted", entityType: "SalesRep", entityId: salesRepId, salesDirectorId: director.id, metadata: { email: rep.email } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Réaffecter
// ---------------------------------------------------------------------------

export { REASSIGN_MAX };

export type ReassignResult =
  | { ok: true; moved: number; alreadyHis: number; unknown: number; repName: string }
  | { ok: false; reason: "REP_NOT_FOUND" | "REP_INACTIVE" | "NOTHING_TO_MOVE" };

/**
 * Confie des dossiers à un commercial ACTIF (nouveau dossier sans commercial
 * ou réaffectation). Chaque dossier est relu en base : un identifiant inconnu
 * est ignoré, un dossier déjà à ce commercial n'est pas touché. Les relances
 * ouvertes le suivent, ainsi que les commissions seulement prévisionnelles
 * et pas encore facturées. Chaque dossier garde la trace du geste (événement
 * « confié à » et audit) et le nouveau commercial est prévenu.
 */
export async function reassignProspects(prospectIds: string[], toSalesRepId: string, director: DirectorRef): Promise<ReassignResult> {
  const ids = [...new Set(prospectIds)].slice(0, REASSIGN_MAX);
  const target = await prisma.salesRep.findUnique({ where: { id: toSalesRepId }, select: { id: true, firstName: true, lastName: true, isActive: true } });
  if (!target) return { ok: false, reason: "REP_NOT_FOUND" };
  if (!target.isActive) return { ok: false, reason: "REP_INACTIVE" };

  const found = await prisma.prospect.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, salesRepId: true } });
  const movable = found.filter((prospect) => prospect.salesRepId !== target.id);
  if (movable.length === 0) return { ok: false, reason: "NOTHING_TO_MOVE" };
  const movableIds = movable.map((prospect) => prospect.id);

  await prisma.$transaction([
    prisma.prospect.updateMany({ where: { id: { in: movableIds } }, data: { salesRepId: target.id } }),
    prisma.salesTask.updateMany({ where: { prospectId: { in: movableIds }, doneAt: null }, data: { salesRepId: target.id } }),
    prisma.commission.updateMany({ where: { prospectId: { in: movableIds }, status: "FORECAST", invoiceId: null }, data: { salesRepId: target.id } }),
  ]);

  const name = fullName(target);
  for (const prospect of movable) {
    await recordProspectEvent({ prospectId: prospect.id, type: "ASSIGNED", summary: `Dossier confié à ${name}.`, actor: { type: "DIRECTOR", id: director.id, label: director.label } });
    await recordAudit({ action: "sales.prospect_reassigned", entityType: "Prospect", entityId: prospect.id, salesDirectorId: director.id, metadata: { from: prospect.salesRepId, to: target.id } });
  }

  const single = movable.length === 1 ? movable[0] : null;
  await notifySalesRep({
    salesRepId: target.id,
    type: "PROSPECT_ASSIGNED",
    title: single ? `Nouveau dossier : ${single.name}` : `${movable.length} nouveaux dossiers`,
    body: single ? "Ce dossier vous a été confié par la direction commerciale." : "Ces dossiers vous ont été confiés par la direction commerciale.",
    linkUrl: single ? `/extranet/dossiers/${single.id}` : "/extranet/pipeline",
  });

  return { ok: true, moved: movable.length, alreadyHis: found.length - movable.length, unknown: ids.length - found.length, repName: name };
}
