import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { canSalesRepSetStatus, isOpenStatus, PROSPECT_STATUS_LABELS, type ProspectStatusCode } from "@/core/sales/pipeline";
import { recordProspectEvent, type SalesActor } from "./events";
import { notifyAdmins, notifySalesRep } from "./notifications";
import type { Prisma, ProspectStatus } from "@/generated/prisma";

export type ProspectInput = {
  name: string;
  ownerName?: string | null;
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

export async function createProspect(input: ProspectInput, salesRepId: string, actor: SalesActor): Promise<{ id: string }> {
  const prospect = await prisma.prospect.create({
    data: {
      name: input.name.trim(),
      ownerName: clean(input.ownerName),
      phone: clean(input.phone),
      email: clean(input.email)?.toLowerCase() ?? null,
      addressLine1: clean(input.addressLine1),
      postalCode: clean(input.postalCode),
      city: clean(input.city),
      finessNumber: clean(input.finessNumber),
      siret: clean(input.siret),
      outletCount: input.outletCount ?? null,
      notes: clean(input.notes),
      monthlyPriceCents: input.monthlyPriceCents ?? null,
      nextActionAt: input.nextActionAt ?? null,
      nextActionLabel: clean(input.nextActionLabel),
      salesRepId,
    },
  });
  await recordProspectEvent({ prospectId: prospect.id, type: "CREATED", summary: `Dossier créé pour ${prospect.name}.`, actor });
  if (input.nextActionAt) {
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
      pharmacy: { select: { id: true, name: true, isActive: true, createdAt: true, memberships: { where: { role: "OWNER" }, take: 1, select: { user: { select: { email: true, lastLoginAt: true } } } } } },
      contracts: { orderBy: { version: "desc" } },
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
      contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true, sentAt: true, finalizedAt: true } },
      commissions: { select: { amountCents: true, status: true } },
      tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { label: true, dueAt: true } },
    },
  });
}

export async function updateProspect(prospectId: string, input: Partial<ProspectInput>, actor: SalesActor): Promise<void> {
  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.ownerName !== undefined ? { ownerName: clean(input.ownerName) } : {}),
      ...(input.phone !== undefined ? { phone: clean(input.phone) } : {}),
      ...(input.email !== undefined ? { email: clean(input.email)?.toLowerCase() ?? null } : {}),
      ...(input.addressLine1 !== undefined ? { addressLine1: clean(input.addressLine1) } : {}),
      ...(input.postalCode !== undefined ? { postalCode: clean(input.postalCode) } : {}),
      ...(input.city !== undefined ? { city: clean(input.city) } : {}),
      ...(input.finessNumber !== undefined ? { finessNumber: clean(input.finessNumber) } : {}),
      ...(input.siret !== undefined ? { siret: clean(input.siret) } : {}),
      ...(input.outletCount !== undefined ? { outletCount: input.outletCount } : {}),
      ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}),
      ...(input.monthlyPriceCents !== undefined ? { monthlyPriceCents: input.monthlyPriceCents } : {}),
    },
  });
  await recordAudit({ action: "sales.prospect_updated", entityType: "Prospect", entityId: prospectId, salesRepId: actor.type === "SALES" ? actor.id : null, platformAdminId: actor.type === "ADMIN" ? actor.id : null, metadata: { fields: Object.keys(input) } });
}

/**
 * Changement de statut. Un commercial ne peut choisir que les étapes de
 * prospection (et « perdu ») ; les étapes contractuelles découlent des faits.
 * L'administrateur peut tout, et c'est tracé.
 */
export async function setProspectStatus(prospectId: string, to: ProspectStatusCode, actor: SalesActor, reason?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId }, select: { status: true, blockedAt: true, name: true, salesRepId: true } });
  const from = prospect.status as ProspectStatusCode;
  if (prospect.blockedAt && actor.type !== "ADMIN") return { ok: false, error: "Ce dossier est suspendu par l'administrateur." };
  if (actor.type === "SALES" && !canSalesRepSetStatus(from, to)) {
    return { ok: false, error: `Le passage « ${PROSPECT_STATUS_LABELS[from]} → ${PROSPECT_STATUS_LABELS[to]} » n'est pas une étape manuelle : elle découle du contrat ou de la création de l'officine.` };
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
  await notifySalesRep({ salesRepId: prospect.salesRepId, type: blocked ? "PROSPECT_BLOCKED" : "PROSPECT_UNBLOCKED", title: `${prospect.name} : ${blocked ? "dossier suspendu" : "dossier réactivé"}`, body: reason ?? "", linkUrl: `/extranet/dossiers/${prospectId}`, severity: blocked ? "WARNING" : "INFO" });
}

export { isOpenStatus };
