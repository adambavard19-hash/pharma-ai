import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { normalizeSiret } from "@/core/contracts/identity";
import { canSalesRepSetStatus, isOpenStatus, PROSPECT_STATUS_LABELS, type ProspectStatusCode } from "@/core/sales/pipeline";
import { DEMO_TASK_CANCELED_LABEL, DEMO_TASK_LABEL, dropDecision, pickNextAction, statusAfterDemoCanceled, statusAfterDemoDone, statusAfterDemoScheduled, validateDemoDate, validateFollowUpDate } from "@/core/sales/board";
import { formatDate, formatDateTime } from "@/lib/format";
import { recordProspectEvent, type SalesActor } from "./events";
import { notifyAdmins, notifySalesRep } from "./notifications";
import { reconcileNewProspect } from "@/server/services/referral-leads";
import type { Prisma, ProspectStatus } from "@/generated/prisma";

export type ProspectInput = {
  name: string;
  legalName?: string | null;
  ownerName?: string | null;
  ownerTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  finessNumber?: string | null;
  siret?: string | null;
  outletCount?: number | null;
  notes?: string | null;
  monthlyPriceCents?: number | null;
  nextActionAt?: Date | null;
  nextActionLabel?: string | null;
};

const clean = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);
/** SIRET saisi : 14 chiffres s'il est valide ; sinon tel quel, et le contrat le signalera comme invalide. */
const cleanSiret = (value: string | null | undefined) => normalizeSiret(value) ?? clean(value);

/** Les champs repris au contrat : figés pour le commercial dès qu'un contrat est envoyé. */
export const CONTRACTUAL_FIELDS = ["name", "legalName", "siret", "addressLine1", "postalCode", "city", "ownerName", "ownerTitle", "email"] as const;
const LOCKING_CONTRACT = ["SENT", "OPENED", "SIGNED_PHARMACY", "SIGNED_COMPANY", "FINALIZED"];

export async function createProspect(input: ProspectInput, salesRepId: string | null, actor: SalesActor, origin: "COMMERCIAL" | "SUPER_ADMIN" = "COMMERCIAL"): Promise<{ id: string }> {
  const prospect = await prisma.prospect.create({
    data: {
      name: input.name.trim(),
      legalName: clean(input.legalName),
      ownerName: clean(input.ownerName),
      ownerTitle: clean(input.ownerTitle),
      origin,
      phone: clean(input.phone),
      email: clean(input.email)?.toLowerCase() ?? null,
      addressLine1: clean(input.addressLine1),
      postalCode: clean(input.postalCode),
      city: clean(input.city),
      finessNumber: clean(input.finessNumber),
      siret: cleanSiret(input.siret),
      outletCount: input.outletCount ?? null,
      notes: clean(input.notes),
      monthlyPriceCents: input.monthlyPriceCents ?? null,
      nextActionAt: input.nextActionAt ?? null,
      nextActionLabel: clean(input.nextActionLabel),
      salesRepId,
    },
  });
  await recordProspectEvent({ prospectId: prospect.id, type: "CREATED", summary: `Dossier créé pour ${prospect.name}.`, actor });
  // Un dossier créé à la main dont l'e-mail est celui d'un confrère proposé au parrainage lui est rattaché.
  await reconcileNewProspect({ id: prospect.id, email: prospect.email, name: prospect.name }, actor);
  if (input.nextActionAt && salesRepId) {
    await prisma.salesTask.create({ data: { prospectId: prospect.id, salesRepId, label: clean(input.nextActionLabel) ?? "Relancer", dueAt: input.nextActionAt } });
  }
  await recordAudit({ action: "sales.prospect_created", entityType: "Prospect", entityId: prospect.id, salesRepId: actor.type === "SALES" ? actor.id : null, platformAdminId: actor.type === "ADMIN" ? actor.id : null });
  return { id: prospect.id };
}

/** Le dossier, ou `null` si l'acteur n'a pas le droit de le voir. Un commercial ne voit que les siens. */
export async function getProspectFor(prospectId: string, viewer: { kind: "SALES"; salesRepId: string } | { kind: "ADMIN" }) {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    include: {
      salesRep: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, commissionType: true, commissionValue: true } },
      pharmacy: { select: { id: true, name: true, isActive: true, createdAt: true, memberships: { where: { role: "OWNER" }, orderBy: [{ isPrincipal: "desc" }, { createdAt: "asc" }], take: 1, select: { user: { select: { email: true, lastLoginAt: true } } } } } },
      contracts: { orderBy: { version: "desc" }, include: { plan: { select: { name: true } } } },
      plan: { select: { id: true, name: true, monthlyPriceCents: true, trialDays: true } },
      commissions: { orderBy: { createdAt: "desc" } },
      tasks: { orderBy: { dueAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 60 },
    },
  });
  if (!prospect) return null;
  if (viewer.kind === "SALES" && prospect.salesRepId !== viewer.salesRepId) return null;
  return prospect;
}

export async function listProspects(filter: { salesRepId?: string; status?: ProspectStatus; city?: string; query?: string; hasContract?: boolean; activated?: boolean }) {
  const where: Prisma.ProspectWhereInput = {
    ...(filter.salesRepId ? { salesRepId: filter.salesRepId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.city ? { city: { contains: filter.city, mode: "insensitive" } } : {}),
    ...(filter.query ? { OR: [{ name: { contains: filter.query, mode: "insensitive" } }, { ownerName: { contains: filter.query, mode: "insensitive" } }, { city: { contains: filter.query, mode: "insensitive" } }] } : {}),
    ...(filter.hasContract ? { contracts: { some: { status: { notIn: ["DRAFT"] } } } } : {}),
    ...(filter.activated ? { status: "ACTIVATED" } : {}),
  };
  return prisma.prospect.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    include: {
      salesRep: { select: { id: true, firstName: true, lastName: true } },
      contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true, sentAt: true, finalizedAt: true, signedArchivedAt: true } },
      commissions: { select: { amountCents: true, status: true } },
      tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { label: true, dueAt: true } },
    },
  });
}

export async function updateProspect(prospectId: string, input: Partial<ProspectInput>, actor: SalesActor): Promise<{ ok: true } | { ok: false; error: string }> {
  // Une fois le contrat parti, ses données ne bougent plus côté commercial : le contrat reste fidèle au dossier.
  if (actor.type === "SALES" && CONTRACTUAL_FIELDS.some((field) => input[field] !== undefined)) {
    const locked = await prisma.contract.findFirst({ where: { prospectId, status: { in: LOCKING_CONTRACT as never } }, select: { id: true } });
    if (locked) return { ok: false, error: "Un contrat a été envoyé : les informations contractuelles ne se modifient plus depuis l'extranet. Demandez à l'administrateur si une correction est nécessaire." };
  }
  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.legalName !== undefined ? { legalName: clean(input.legalName) } : {}),
      ...(input.ownerTitle !== undefined ? { ownerTitle: clean(input.ownerTitle) } : {}),
      ...(input.ownerName !== undefined ? { ownerName: clean(input.ownerName) } : {}),
      ...(input.phone !== undefined ? { phone: clean(input.phone) } : {}),
      ...(input.email !== undefined ? { email: clean(input.email)?.toLowerCase() ?? null } : {}),
      ...(input.addressLine1 !== undefined ? { addressLine1: clean(input.addressLine1) } : {}),
      ...(input.postalCode !== undefined ? { postalCode: clean(input.postalCode) } : {}),
      ...(input.city !== undefined ? { city: clean(input.city) } : {}),
      ...(input.finessNumber !== undefined ? { finessNumber: clean(input.finessNumber) } : {}),
      ...(input.siret !== undefined ? { siret: cleanSiret(input.siret) } : {}),
      ...(input.outletCount !== undefined ? { outletCount: input.outletCount } : {}),
      ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}),
      ...(input.monthlyPriceCents !== undefined ? { monthlyPriceCents: input.monthlyPriceCents } : {}),
    },
  });
  await recordAudit({ action: "sales.prospect_updated", entityType: "Prospect", entityId: prospectId, salesRepId: actor.type === "SALES" ? actor.id : null, platformAdminId: actor.type === "ADMIN" ? actor.id : null, metadata: { fields: Object.keys(input) } });
  return { ok: true };
}

/**
 * Changement de statut. Un commercial ne peut choisir que les étapes de
 * prospection (et « perdu ») ; les étapes contractuelles découlent des faits.
 * L'administrateur peut tout, et c'est tracé.
 */
export async function setProspectStatus(prospectId: string, to: ProspectStatusCode, actor: SalesActor, reason?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId }, select: { ...FOLLOW_UP_SELECT, blockedAt: true } });
  const from = prospect.status as ProspectStatusCode;
  if (prospect.blockedAt && actor.type !== "ADMIN") return { ok: false, error: "Ce dossier est suspendu par l'administrateur." };
  if (actor.type === "SALES" && from === "LOST" && to !== "LOST") {
    // Un dossier « perdu » dont le contrat suit son cours ne se rouvre pas à la main : l'étape découle du contrat.
    const active = await prisma.contract.findFirst({ where: { prospectId, status: { in: LOCKING_CONTRACT as never } }, select: { id: true } });
    if (active) return { ok: false, error: "Un contrat est en cours ou signé pour ce dossier : son étape découle du contrat." };
  }
  if (actor.type === "SALES" && !canSalesRepSetStatus(from, to)) {
    return { ok: false, error: `Le passage « ${PROSPECT_STATUS_LABELS[from]} → ${PROSPECT_STATUS_LABELS[to]} » n'est pas une étape manuelle : elle découle du contrat ou de la création de l'officine.` };
  }
  // « Démo programmée » exige une date (sinon le dossier n'apparaît dans aucune liste de démos) ;
  // « Démo réalisée » date la démo : les deux passent par les gestes dédiés.
  if (to === "DEMO_SCHEDULED") {
    return { ok: false, error: actor.type === "SALES" ? "Une démonstration se programme avec sa date et son heure : l'administrateur la fixe depuis la console." : "Une démonstration se programme avec sa date et son heure : utilisez « Programmer une démo »." };
  }
  if (to === "DEMO_DONE") {
    await applyDemoDone(prospect, actor, to, clean(reason));
    return { ok: true };
  }
  await prisma.prospect.update({ where: { id: prospectId }, data: { status: to, lastContactAt: new Date(), ...(to === "LOST" ? { lostReason: reason ?? null } : {}) } });
  await recordProspectEvent({ prospectId, type: "STATUS_CHANGED", summary: `${PROSPECT_STATUS_LABELS[from]} → ${PROSPECT_STATUS_LABELS[to]}${reason ? ` — ${reason}` : ""}.`, actor, metadata: { from, to } });
  await recordAudit({ action: "sales.prospect_status_changed", entityType: "Prospect", entityId: prospectId, salesRepId: actor.type === "SALES" ? actor.id : null, platformAdminId: actor.type === "ADMIN" ? actor.id : null, metadata: { from, to } });
  if (to === "LOST") await notifyAdmins({ type: "PROSPECT_LOST", title: `${prospect.name} : dossier perdu`, body: reason ?? "Sans motif précisé.", linkUrl: `/admin/dossiers/${prospectId}` });
  return { ok: true };
}

export async function addProspectNote(prospectId: string, note: string, actor: SalesActor): Promise<void> {
  await prisma.prospect.update({ where: { id: prospectId }, data: { lastContactAt: new Date() } });
  await recordProspectEvent({ prospectId, type: "NOTE", summary: note.trim(), actor });
}

export async function addProspectTask(prospectId: string, salesRepId: string, label: string, dueAt: Date, actor: SalesActor): Promise<void> {
  await prisma.salesTask.create({ data: { prospectId, salesRepId, label: label.trim(), dueAt } });
  await prisma.prospect.update({ where: { id: prospectId }, data: { nextActionAt: dueAt, nextActionLabel: label.trim() } });
  await recordProspectEvent({ prospectId, type: "TASK_CREATED", summary: `Relance : ${label.trim()} (${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(dueAt)}).`, actor });
}

export async function completeTask(taskId: string, actor: SalesActor & { type: "SALES" | "ADMIN" }): Promise<void> {
  const task = await prisma.salesTask.findUniqueOrThrow({ where: { id: taskId }, select: { id: true, prospectId: true, salesRepId: true, label: true } });
  if (actor.type === "SALES" && task.salesRepId !== actor.id) throw new Error("Tâche introuvable.");
  await prisma.salesTask.update({ where: { id: task.id }, data: { doneAt: new Date() } });
  const next = await prisma.salesTask.findFirst({ where: { prospectId: task.prospectId, doneAt: null }, orderBy: { dueAt: "asc" } });
  await prisma.prospect.update({ where: { id: task.prospectId }, data: { lastContactAt: new Date(), nextActionAt: next?.dueAt ?? null, nextActionLabel: next?.label ?? null } });
  await recordProspectEvent({ prospectId: task.prospectId, type: "TASK_DONE", summary: `Fait : ${task.label}.`, actor });
}

export async function listTasks(salesRepId: string) {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const tasks = await prisma.salesTask.findMany({ where: { salesRepId, doneAt: null }, orderBy: { dueAt: "asc" }, include: { prospect: { select: { id: true, name: true, phone: true, email: true, status: true } } } });
  return {
    late: tasks.filter((t) => t.dueAt < startOfDay),
    today: tasks.filter((t) => t.dueAt >= startOfDay && t.dueAt <= endOfDay),
    upcoming: tasks.filter((t) => t.dueAt > endOfDay),
  };
}

// ---- Contrôles administrateur ----------------------------------------------

export async function reassignProspect(prospectId: string, salesRepId: string, adminId: string, adminLabel: string): Promise<void> {
  const [prospect, rep] = await Promise.all([
    prisma.prospect.findUniqueOrThrow({ where: { id: prospectId }, select: { name: true, salesRepId: true } }),
    prisma.salesRep.findUniqueOrThrow({ where: { id: salesRepId }, select: { firstName: true, lastName: true } }),
  ]);
  await prisma.$transaction([
    prisma.prospect.update({ where: { id: prospectId }, data: { salesRepId } }),
    prisma.salesTask.updateMany({ where: { prospectId, doneAt: null }, data: { salesRepId } }),
    prisma.commission.updateMany({ where: { prospectId, status: { in: ["FORECAST"] } }, data: { salesRepId } }),
  ]);
  await recordProspectEvent({ prospectId, type: "ASSIGNED", summary: `Dossier confié à ${rep.firstName} ${rep.lastName}.`, actor: { type: "ADMIN", id: adminId, label: adminLabel } });
  await recordAudit({ action: "sales.prospect_reassigned", entityType: "Prospect", entityId: prospectId, platformAdminId: adminId, metadata: { from: prospect.salesRepId, to: salesRepId } });
  await notifySalesRep({ salesRepId, type: "PROSPECT_ASSIGNED", title: `Nouveau dossier : ${prospect.name}`, body: "Ce dossier vous a été confié par l'administrateur.", linkUrl: `/extranet/dossiers/${prospectId}` });
}

export async function setProspectBlocked(prospectId: string, blocked: boolean, reason: string | null, adminId: string, adminLabel: string): Promise<void> {
  const prospect = await prisma.prospect.update({ where: { id: prospectId }, data: { blockedAt: blocked ? new Date() : null, blockedReason: blocked ? reason : null }, select: { name: true, salesRepId: true } });
  await recordProspectEvent({ prospectId, type: blocked ? "BLOCKED" : "UNBLOCKED", summary: blocked ? `Dossier suspendu${reason ? ` — ${reason}` : ""}.` : "Dossier réactivé.", actor: { type: "ADMIN", id: adminId, label: adminLabel } });
  await recordAudit({ action: "sales.prospect_blocked", entityType: "Prospect", entityId: prospectId, platformAdminId: adminId, metadata: { blocked, reason } });
  if (prospect.salesRepId) await notifySalesRep({ salesRepId: prospect.salesRepId, type: blocked ? "PROSPECT_BLOCKED" : "PROSPECT_UNBLOCKED", title: `${prospect.name} : ${blocked ? "dossier suspendu" : "dossier réactivé"}`, body: reason ?? "", linkUrl: `/extranet/dossiers/${prospectId}`, severity: blocked ? "WARNING" : "INFO" });
}

// ---- Démonstrations et relances, depuis la console ---------------------------

/** L'administrateur qui agit depuis la console. */
export type AdminActor = { type: "ADMIN"; id: string; label: string };

type ServiceOutcome<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/** Ce que l'on lit d'un dossier avant de toucher à sa démo ou à sa prochaine action. */
const FOLLOW_UP_SELECT = { id: true, name: true, status: true, salesRepId: true, demoAt: true, demoDoneAt: true, nextActionAt: true, nextActionLabel: true } as const;

type FollowUpProspect = { id: string; name: string; status: string; salesRepId: string | null; demoAt: Date | null; demoDoneAt: Date | null; nextActionAt: Date | null; nextActionLabel: string | null };

/** Les colonnes d'audit de l'acteur : administrateur ou commercial. */
const auditActor = (actor: SalesActor) => ({ platformAdminId: actor.type === "ADMIN" ? actor.id : null, salesRepId: actor.type === "SALES" ? actor.id : null });

/**
 * La tâche « Démonstration » de la démo en cours : celle que `scheduleDemo` a
 * créée et datée à l'heure de la démo. Une tâche que le commercial a créée
 * lui-même, même sous ce libellé, n'est jamais touchée.
 */
function pendingDemoTaskWhere(prospectId: string, demoAt: Date): Prisma.SalesTaskWhereInput {
  return { prospectId, doneAt: null, label: DEMO_TASK_LABEL, dueAt: demoAt };
}

/** La prochaine action actuelle du dossier, sauf si c'était la démonstration elle-même (elle est recalculée). */
function currentNonDemoAction(prospect: { nextActionAt: Date | null; nextActionLabel: string | null }) {
  return prospect.nextActionAt && prospect.nextActionLabel !== DEMO_TASK_LABEL ? { at: prospect.nextActionAt, label: prospect.nextActionLabel ?? "Relancer" } : null;
}

async function openTaskActions(prospectId: string, salesRepId: string | null) {
  if (!salesRepId) return [];
  const tasks = await prisma.salesTask.findMany({ where: { prospectId, doneAt: null }, select: { dueAt: true, label: true } });
  return tasks.map((task) => ({ at: task.dueAt, label: task.label }));
}

/**
 * Programme (ou reprogramme) une démonstration. Le dossier passe en « Démo
 * programmée » quand son étape le permet (pas une fois le contrat parti) ;
 * s'il a un commercial, la démo entre dans son agenda (tâche
 * « Démonstration ») pour apparaître dans son extranet.
 */
export async function scheduleDemo(prospectId: string, at: Date, actor: AdminActor, note?: string | null): Promise<ServiceOutcome<{ status: ProspectStatusCode; taskId: string | null }>> {
  // Revérifiée ici aussi : chaque chemin (fenêtre, pipeline) passe par ce service.
  const check = validateDemoDate(at, new Date());
  if (!check.ok) return { ok: false, error: check.error };
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, select: { ...FOLLOW_UP_SELECT, contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true } } } });
  if (!prospect) return { ok: false, error: "Dossier introuvable." };
  const from = prospect.status as ProspectStatusCode;
  const nextStatus = statusAfterDemoScheduled(from, prospect.contracts[0]?.status ?? null);
  const rescheduled = Boolean(prospect.demoAt && !prospect.demoDoneAt);
  const comment = clean(note);

  // Une seule tâche « Démonstration » ouverte par démo : reprogrammer déplace la sienne.
  let taskId: string | null = null;
  if (prospect.salesRepId) {
    const existing = rescheduled && prospect.demoAt ? await prisma.salesTask.findFirst({ where: pendingDemoTaskWhere(prospectId, prospect.demoAt), select: { id: true } }) : null;
    const task = existing
      ? await prisma.salesTask.update({ where: { id: existing.id }, data: { dueAt: at, salesRepId: prospect.salesRepId }, select: { id: true } })
      : await prisma.salesTask.create({ data: { prospectId, salesRepId: prospect.salesRepId, label: DEMO_TASK_LABEL, dueAt: at }, select: { id: true } });
    taskId = task.id;
  }
  const next = pickNextAction([...(await openTaskActions(prospectId, prospect.salesRepId)), currentNonDemoAction(prospect), { at, label: DEMO_TASK_LABEL }]);
  // La nouvelle démo n'est pas encore faite : la date de la précédente démo
  // réalisée quitte le dossier, mais reste dans l'historique et l'audit (et
  // revient si cette nouvelle démo est annulée).
  await prisma.prospect.update({
    where: { id: prospectId },
    data: { demoAt: at, demoDoneAt: null, lastContactAt: new Date(), nextActionAt: next.at, nextActionLabel: next.label, ...(nextStatus ? { status: nextStatus } : {}) },
  });

  const when = formatDateTime(at);
  const what = rescheduled ? `Démonstration reprogrammée au ${when}` : `Démonstration programmée le ${when}`;
  const previousDone = prospect.demoDoneAt ? ` (précédente démo réalisée le ${formatDate(prospect.demoDoneAt)})` : "";
  await recordProspectEvent({
    prospectId,
    type: nextStatus ? "STATUS_CHANGED" : "NOTE",
    summary: `${nextStatus ? `${PROSPECT_STATUS_LABELS[from]} → ${PROSPECT_STATUS_LABELS[nextStatus]} — ` : ""}${what}${previousDone}${comment ? ` — ${comment}` : ""}.`,
    actor,
    metadata: { demoAt: at.toISOString(), previousDemoAt: iso(prospect.demoAt), previousDemoDoneAt: iso(prospect.demoDoneAt), ...(nextStatus ? { from, to: nextStatus } : {}), taskId },
  });
  await recordAudit({
    action: "sales.demo_scheduled",
    entityType: "Prospect",
    entityId: prospectId,
    platformAdminId: actor.id,
    metadata: { before: { status: from, demoAt: iso(prospect.demoAt), demoDoneAt: iso(prospect.demoDoneAt) }, after: { status: nextStatus ?? from, demoAt: at.toISOString(), demoDoneAt: null }, taskId, salesRepId: prospect.salesRepId, note: comment },
  });
  if (prospect.salesRepId) {
    await notifySalesRep({ salesRepId: prospect.salesRepId, type: "DEMO_SCHEDULED", title: `${prospect.name} : ${rescheduled ? "démonstration reprogrammée" : "démonstration programmée"}`, body: `Le ${when}, par ${actor.label}.`, linkUrl: `/extranet/dossiers/${prospectId}` });
  }
  return { ok: true, status: nextStatus ?? from, taskId };
}

/**
 * La démonstration a eu lieu. Depuis la liste des démos, le dossier passe en
 * « Démo réalisée » s'il n'était pas déjà plus loin ; déposé explicitement
 * dans la colonne (`explicit`), il y passe dans tous les cas permis.
 */
export async function markDemoDone(prospectId: string, actor: AdminActor, options: { note?: string | null; explicit?: boolean } = {}): Promise<ServiceOutcome<{ status: ProspectStatusCode }>> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, select: FOLLOW_UP_SELECT });
  if (!prospect) return { ok: false, error: "Dossier introuvable." };
  if (!options.explicit && !prospect.demoAt) return { ok: false, error: "Aucune démonstration n'est programmée pour ce dossier." };
  if (!options.explicit && prospect.demoDoneAt) return { ok: false, error: "Cette démonstration est déjà marquée réalisée." };
  const status = await applyDemoDone(prospect, actor, statusAfterDemoDone(prospect.status, options.explicit), clean(options.note));
  return { ok: true, status };
}

/**
 * Enregistre une démonstration réalisée : date, tâche « Démonstration » de la
 * démo soldée, historique et audit `sales.demo_done` (ce que comptent les
 * indicateurs « démos réalisées »). Une démo déjà marquée réalisée garde sa
 * date : déplacer de nouveau le dossier en « Démo réalisée » n'est alors
 * qu'un changement d'étape, sans nouvelle démo comptée.
 */
async function applyDemoDone(prospect: FollowUpProspect, actor: SalesActor, target: ProspectStatusCode | null, comment: string | null): Promise<ProspectStatusCode> {
  const from = prospect.status as ProspectStatusCode;
  const nextStatus = target && target !== from ? target : null;
  const now = new Date();
  const alreadyDone = prospect.demoDoneAt;
  if (alreadyDone && !nextStatus) return from;
  const doneAt = alreadyDone ?? now;

  if (!alreadyDone && prospect.demoAt && prospect.salesRepId) await prisma.salesTask.updateMany({ where: pendingDemoTaskWhere(prospect.id, prospect.demoAt), data: { doneAt: now } });
  const next = pickNextAction([...(await openTaskActions(prospect.id, prospect.salesRepId)), currentNonDemoAction(prospect)]);
  await prisma.prospect.update({
    where: { id: prospect.id },
    data: { demoDoneAt: doneAt, lastContactAt: now, nextActionAt: next.at, nextActionLabel: next.label, ...(nextStatus ? { status: nextStatus } : {}) },
  });
  const step = nextStatus ? `${PROSPECT_STATUS_LABELS[from]} → ${PROSPECT_STATUS_LABELS[nextStatus]}` : "";
  const what = alreadyDone ? `démonstration déjà réalisée le ${formatDate(alreadyDone)}` : `Démonstration réalisée${prospect.demoAt ? ` (prévue le ${formatDateTime(prospect.demoAt)})` : ""}`;
  await recordProspectEvent({
    prospectId: prospect.id,
    type: nextStatus ? "STATUS_CHANGED" : "NOTE",
    summary: `${step ? `${step} — ` : ""}${what}${comment ? ` — ${comment}` : ""}.`,
    actor,
    metadata: { demoAt: iso(prospect.demoAt), demoDoneAt: doneAt.toISOString(), ...(nextStatus ? { from, to: nextStatus } : {}) },
  });
  await recordAudit({
    action: alreadyDone ? "sales.prospect_status_changed" : "sales.demo_done",
    entityType: "Prospect",
    entityId: prospect.id,
    ...auditActor(actor),
    metadata: { from, to: nextStatus ?? from, before: { status: from, demoDoneAt: iso(prospect.demoDoneAt) }, after: { status: nextStatus ?? from, demoDoneAt: doneAt.toISOString() }, salesRepId: prospect.salesRepId },
  });
  return nextStatus ?? from;
}

/** Ce que l'historique dit de la programmation de la démo en cours : l'étape d'avant, et la démo réalisée qu'elle a remplacée. */
async function demoSchedulingBefore(prospectId: string): Promise<{ from: string | null; previousDemoAt: Date | null; previousDemoDoneAt: Date | null } | null> {
  const events = await prisma.prospectEvent.findMany({ where: { prospectId, type: "STATUS_CHANGED" }, orderBy: { createdAt: "desc" }, take: 30, select: { metadata: true } });
  const asDate = (value: unknown) => (typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? new Date(value) : null);
  for (const event of events) {
    const meta = (event.metadata ?? {}) as Record<string, unknown>;
    if (meta.to !== "DEMO_SCHEDULED") continue;
    return { from: typeof meta.from === "string" ? meta.from : null, previousDemoAt: asDate(meta.previousDemoAt), previousDemoDoneAt: asDate(meta.previousDemoDoneAt) };
  }
  return null;
}

/**
 * Annule une démonstration à venir, et c'est tracé. Le dossier qui attendait
 * cette démo retrouve l'étape qu'il avait avant sa programmation (et la date
 * de la démo réalisée qu'elle remplaçait). La tâche « Démonstration » de
 * l'agenda du commercial n'est jamais supprimée : elle est close, marquée
 * annulée, avec son propre événement.
 */
export async function cancelDemo(prospectId: string, actor: AdminActor, reason: string): Promise<ServiceOutcome<{ status: ProspectStatusCode }>> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, select: FOLLOW_UP_SELECT });
  if (!prospect) return { ok: false, error: "Dossier introuvable." };
  if (!prospect.demoAt || prospect.demoDoneAt) return { ok: false, error: "Aucune démonstration à annuler pour ce dossier." };
  const demoAt = prospect.demoAt;
  const from = prospect.status as ProspectStatusCode;
  const before = from === "DEMO_SCHEDULED" ? await demoSchedulingBefore(prospectId) : null;
  const nextStatus = statusAfterDemoCanceled(from, before?.from);
  // La démo réalisée que cette programmation avait remplacée revient sur le dossier.
  const restored = nextStatus && before?.previousDemoDoneAt ? { demoAt: before.previousDemoAt, demoDoneAt: before.previousDemoDoneAt } : null;
  const motive = clean(reason);
  const now = new Date();

  const demoTasks = prospect.salesRepId ? await prisma.salesTask.findMany({ where: pendingDemoTaskWhere(prospectId, demoAt), select: { id: true } }) : [];
  if (demoTasks.length > 0) {
    await prisma.salesTask.updateMany({ where: { id: { in: demoTasks.map((task) => task.id) }, doneAt: null }, data: { doneAt: now, label: DEMO_TASK_CANCELED_LABEL } });
  }
  const next = pickNextAction([...(await openTaskActions(prospectId, prospect.salesRepId)), currentNonDemoAction(prospect)]);
  await prisma.prospect.update({
    where: { id: prospectId },
    data: { demoAt: restored?.demoAt ?? null, ...(restored ? { demoDoneAt: restored.demoDoneAt } : {}), nextActionAt: next.at, nextActionLabel: next.label, ...(nextStatus ? { status: nextStatus } : {}) },
  });
  await recordProspectEvent({
    prospectId,
    type: nextStatus ? "STATUS_CHANGED" : "NOTE",
    summary: `${nextStatus ? `${PROSPECT_STATUS_LABELS[from]} → ${PROSPECT_STATUS_LABELS[nextStatus]} — ` : ""}Démonstration du ${formatDateTime(demoAt)} annulée${restored ? ` (la démo réalisée le ${formatDate(restored.demoDoneAt)} reste la dernière)` : ""}${motive ? ` — ${motive}` : ""}.`,
    actor,
    metadata: { demoAt: iso(demoAt), ...(nextStatus ? { from, to: nextStatus } : {}), ...(restored ? { restoredDemoAt: iso(restored.demoAt), restoredDemoDoneAt: iso(restored.demoDoneAt) } : {}), closedTaskIds: demoTasks.map((task) => task.id) },
  });
  if (demoTasks.length > 0) {
    await recordProspectEvent({
      prospectId,
      type: "TASK_DONE",
      summary: `Tâche « ${DEMO_TASK_LABEL} » du ${formatDateTime(demoAt)} close dans l'agenda du commercial : démonstration annulée.`,
      actor,
      metadata: { taskIds: demoTasks.map((task) => task.id), canceled: true, dueAt: iso(demoAt) },
    });
  }
  await recordAudit({
    action: "sales.demo_canceled",
    entityType: "Prospect",
    entityId: prospectId,
    platformAdminId: actor.id,
    metadata: {
      before: { status: from, demoAt: iso(demoAt), demoDoneAt: null },
      after: { status: nextStatus ?? from, demoAt: iso(restored?.demoAt), demoDoneAt: iso(restored?.demoDoneAt) },
      reason: motive,
      closedTaskIds: demoTasks.map((task) => task.id),
      salesRepId: prospect.salesRepId,
    },
  });
  if (prospect.salesRepId) {
    await notifySalesRep({ salesRepId: prospect.salesRepId, type: "DEMO_CANCELED", title: `${prospect.name} : démonstration annulée`, body: motive ?? "", linkUrl: `/extranet/dossiers/${prospectId}`, severity: "WARNING" });
  }
  return { ok: true, status: nextStatus ?? from };
}

/**
 * Fixe une relance sur un dossier ouvert. Avec un commercial, elle entre dans
 * son agenda (tâche) et la prochaine action du dossier devient la plus proche
 * de ses relances ouvertes ; sans commercial, elle remplace la prochaine
 * action du dossier (la console n'a pas d'agenda).
 */
export async function setProspectFollowUp(prospectId: string, dueAt: Date, label: string, actor: AdminActor): Promise<ServiceOutcome<{ taskId: string | null }>> {
  const check = validateFollowUpDate(dueAt, new Date());
  if (!check.ok) return { ok: false, error: check.error };
  const text = clean(label) ?? "Relancer";
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, select: FOLLOW_UP_SELECT });
  if (!prospect) return { ok: false, error: "Dossier introuvable." };
  if (!isOpenStatus(prospect.status as ProspectStatusCode)) return { ok: false, error: "Ce dossier est clos (activé ou perdu) : il n'y a plus de relance à fixer." };

  let taskId: string | null = null;
  if (prospect.salesRepId) {
    const task = await prisma.salesTask.create({ data: { prospectId, salesRepId: prospect.salesRepId, label: text, dueAt }, select: { id: true } });
    taskId = task.id;
  }
  const current = prospect.nextActionAt ? { at: prospect.nextActionAt, label: prospect.nextActionLabel ?? "Relancer" } : null;
  const next = prospect.salesRepId ? pickNextAction([...(await openTaskActions(prospectId, prospect.salesRepId)), current, { at: dueAt, label: text }]) : { at: dueAt, label: text };
  await prisma.prospect.update({ where: { id: prospectId }, data: { nextActionAt: next.at, nextActionLabel: next.label } });
  await recordProspectEvent({ prospectId, type: "TASK_CREATED", summary: `Relance : ${text} (${formatDate(dueAt)}).`, actor, metadata: { taskId, dueAt: dueAt.toISOString() } });
  await recordAudit({
    action: "sales.followup_set",
    entityType: "Prospect",
    entityId: prospectId,
    platformAdminId: actor.id,
    metadata: { changes: { nextActionAt: { from: iso(prospect.nextActionAt), to: iso(next.at) }, nextActionLabel: { from: prospect.nextActionLabel, to: next.label } }, followUp: { label: text, dueAt: dueAt.toISOString() }, taskId, salesRepId: prospect.salesRepId },
  });
  if (prospect.salesRepId) {
    await notifySalesRep({ salesRepId: prospect.salesRepId, type: "FOLLOWUP_SET", title: `${prospect.name} : relance ajoutée`, body: `${text} — ${formatDate(dueAt)}, par ${actor.label}.`, linkUrl: `/extranet/dossiers/${prospectId}` });
  }
  return { ok: true, taskId };
}

/**
 * Marque faite la prochaine action d'un dossier qui ne la porte pas dans une
 * tâche (dossier de la console, demande du site) : elle est effacée — ou
 * remplacée par la plus proche des relances ouvertes — et c'est tracé.
 */
export async function clearProspectFollowUp(prospectId: string, actor: AdminActor): Promise<ServiceOutcome> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, select: FOLLOW_UP_SELECT });
  if (!prospect) return { ok: false, error: "Dossier introuvable." };
  if (!prospect.nextActionAt) return { ok: false, error: "Ce dossier n'a pas de prochaine action à marquer faite." };
  const next = pickNextAction(await openTaskActions(prospectId, prospect.salesRepId));
  await prisma.prospect.update({ where: { id: prospectId }, data: { nextActionAt: next.at, nextActionLabel: next.label, lastContactAt: new Date() } });
  await recordProspectEvent({ prospectId, type: "TASK_DONE", summary: `Fait : ${prospect.nextActionLabel ?? "Relancer"}.`, actor, metadata: { dueAt: iso(prospect.nextActionAt) } });
  await recordAudit({
    action: "sales.followup_set",
    entityType: "Prospect",
    entityId: prospectId,
    platformAdminId: actor.id,
    metadata: { done: true, changes: { nextActionAt: { from: iso(prospect.nextActionAt), to: iso(next.at) }, nextActionLabel: { from: prospect.nextActionLabel, to: next.label } } },
  });
  return { ok: true };
}

/**
 * Un déplacement sur le tableau du pipeline, revérifié contre l'état réel du
 * dossier : les étapes automatiques refusent le dépôt, « Perdu » exige un
 * motif, « Démo programmée » une date, « Démo réalisée » date la démo.
 */
export async function adminMoveProspect(prospectId: string, to: string, actor: AdminActor, input: { reason?: string | null; demoAt?: Date | null; note?: string | null } = {}): Promise<ServiceOutcome<{ status: ProspectStatusCode }>> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, select: { status: true, contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true } } } });
  if (!prospect) return { ok: false, error: "Dossier introuvable." };
  const decision = dropDecision({ status: prospect.status, contractStatus: prospect.contracts[0]?.status ?? null }, to);
  if (!decision.ok) return { ok: false, error: decision.reason };
  const target = to as ProspectStatusCode;
  if (decision.needs === "reason" && (clean(input.reason)?.length ?? 0) < 5) return { ok: false, error: "Indiquez le motif de la perte (au moins 5 caractères)." };
  if (decision.needs === "demo") {
    if (!input.demoAt) return { ok: false, error: "Indiquez la date et l'heure de la démonstration." };
    return scheduleDemo(prospectId, input.demoAt, actor, input.note);
  }
  if (target === "DEMO_DONE") return markDemoDone(prospectId, actor, { note: input.note, explicit: true });
  const result = await setProspectStatus(prospectId, target, actor, clean(input.reason));
  return result.ok ? { ok: true, status: target } : result;
}

export { isOpenStatus };
