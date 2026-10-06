import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { computeCommissionCents } from "@/core/sales/commission";
import { COMMISSION_STATUS_LABELS, type CommissionStatusCode } from "@/core/sales/pipeline";
import { recordProspectEvent, type SalesActor } from "./events";
import { notifyAdmins, notifySalesRep } from "./notifications";
import type { CommissionStatus } from "@/generated/prisma";
import { formatCents } from "@/lib/format";

const euros = (cents: number) => formatCents(cents);

/** Crée (ou met à jour) la commission d'un dossier à partir du contrat et de la règle du commercial. */
export async function upsertCommissionForContract(params: { prospectId: string; contractId: string; status: "FORECAST" | "EARNED"; actor: SalesActor }): Promise<void> {
  const contract = await prisma.contract.findUniqueOrThrow({ where: { id: params.contractId }, include: { prospect: { include: { salesRep: true } } } });
  const rep = contract.prospect.salesRep;
  // Dossier tenu par la console, sans commercial : aucune commission à calculer.
  if (!rep) return;
  const amountCents = computeCommissionCents({ type: rep.commissionType, value: rep.commissionValue }, { monthlyPriceCents: contract.monthlyPriceCents, durationMonths: contract.durationMonths });
  const existing = await prisma.commission.findFirst({ where: { prospectId: params.prospectId, status: { in: ["FORECAST", "EARNED", "PAYABLE"] } } });
  const dueAt = params.status === "EARNED" ? endOfNextMonth(new Date()) : null;
  const commission = existing
    ? await prisma.commission.update({ where: { id: existing.id }, data: { amountCents, status: params.status, salesRepId: rep.id, type: rep.commissionType, dueAt: dueAt ?? existing.dueAt } })
    : await prisma.commission.create({ data: { prospectId: params.prospectId, salesRepId: rep.id, type: rep.commissionType, amountCents, status: params.status, dueAt } });
  await recordProspectEvent({
    prospectId: params.prospectId,
    type: existing ? "COMMISSION_UPDATED" : "COMMISSION_CREATED",
    summary: `Commission ${euros(amountCents)} — ${COMMISSION_STATUS_LABELS[params.status]}.`,
    actor: params.actor,
    metadata: { commissionId: commission.id, amountCents, status: params.status },
  });
  if (params.status === "EARNED") {
    await notifySalesRep({ salesRepId: rep.id, type: "COMMISSION_EARNED", title: `Commission acquise : ${euros(amountCents)}`, body: `${contract.prospect.name} — contrat finalisé.`, linkUrl: "/extranet/commissions", severity: "SUCCESS" });
    if (amountCents >= 50_000) await notifyAdmins({ type: "COMMISSION_LARGE", title: `Commission importante : ${euros(amountCents)}`, body: `${rep.firstName} ${rep.lastName} — ${contract.prospect.name}.`, linkUrl: `/admin/dossiers/${params.prospectId}`, severity: "WARNING" });
  }
}

function endOfNextMonth(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth() + 2, 0, 12, 0, 0);
}

/** Qui modifie une commission : un administrateur de la console ou le directeur commercial. */
export type CommissionActor = { type: "ADMIN" | "DIRECTOR"; id: string; label: string };

export type UpdateCommissionOptions = {
  /** Vrai quand l'appel vient du flux de la facture : seul cas où une commission facturée change de statut ou de montant. */
  viaInvoice?: boolean;
};

export class CommissionInvoicedError extends Error {
  constructor() {
    super("Cette commission est réclamée par une facture : gérez-la depuis la facture.");
    this.name = "CommissionInvoicedError";
  }
}

export class CommissionChangedError extends Error {
  constructor() {
    super("La commission a changé entre-temps : rechargez la page.");
    this.name = "CommissionChangedError";
  }
}

/**
 * Modification d'une commission : montant, statut, date, note. Tracée et notifiée.
 *
 * L'acteur est soit un administrateur, soit le directeur commercial (objet
 * `{ type, id, label }`), soit — forme historique, conservée pour la console —
 * l'identifiant et le nom d'un administrateur.
 */
export async function updateCommission(commissionId: string, patch: { amountCents?: number; status?: CommissionStatusCode; dueAt?: Date | null; note?: string | null }, actor: CommissionActor, options?: UpdateCommissionOptions): Promise<void>;
export async function updateCommission(commissionId: string, patch: { amountCents?: number; status?: CommissionStatusCode; dueAt?: Date | null; note?: string | null }, adminId: string, adminLabel: string): Promise<void>;
export async function updateCommission(commissionId: string, patch: { amountCents?: number; status?: CommissionStatusCode; dueAt?: Date | null; note?: string | null }, actorOrAdminId: CommissionActor | string, adminLabelOrOptions?: string | UpdateCommissionOptions): Promise<void> {
  const adminLabel = typeof adminLabelOrOptions === "string" ? adminLabelOrOptions : undefined;
  const options: UpdateCommissionOptions = typeof adminLabelOrOptions === "object" && adminLabelOrOptions ? adminLabelOrOptions : {};
  const actor: CommissionActor = typeof actorOrAdminId === "string" ? { type: "ADMIN", id: actorOrAdminId, label: adminLabel ?? "" } : actorOrAdminId;
  const before = await prisma.commission.findUniqueOrThrow({ where: { id: commissionId }, include: { prospect: { select: { name: true } } } });
  // Une commission réclamée par une facture se règle PAR la facture : la changer ici la ferait diverger de ce que la facture annonce.
  if (before.invoiceId && !options.viaInvoice && (patch.status !== undefined || patch.amountCents !== undefined)) {
    throw new CommissionInvoicedError();
  }
  const status = (patch.status ?? before.status) as CommissionStatus;
  // Écriture conditionnée au statut relu : deux gestes quasi simultanés ne s'écrasent pas (le second est refusé, sans doublon d'événement ni de notification).
  const written = await prisma.commission.updateMany({
    where: { id: commissionId, status: before.status },
    data: {
      ...(patch.amountCents !== undefined ? { amountCents: patch.amountCents } : {}),
      ...(patch.status ? { status } : {}),
      ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.status === "PAID" ? { paidAt: new Date() } : {}),
    },
  });
  if (written.count !== 1) throw new CommissionChangedError();
  const commission = await prisma.commission.findUniqueOrThrow({ where: { id: commissionId } });
  const salesActor: SalesActor = { type: actor.type, id: actor.id, label: actor.label };
  await recordProspectEvent({
    prospectId: commission.prospectId,
    type: patch.status === "PAID" ? "COMMISSION_PAID" : "COMMISSION_UPDATED",
    summary: patch.status === "PAID" ? `Commission ${euros(commission.amountCents)} payée.` : `Commission mise à jour : ${euros(commission.amountCents)} — ${COMMISSION_STATUS_LABELS[commission.status as CommissionStatusCode]}.`,
    actor: salesActor,
    metadata: { before: { amountCents: before.amountCents, status: before.status }, after: { amountCents: commission.amountCents, status: commission.status } },
  });
  await recordAudit({
    action: "sales.commission_updated",
    entityType: "Commission",
    entityId: commissionId,
    ...(actor.type === "DIRECTOR" ? { salesDirectorId: actor.id } : { platformAdminId: actor.id }),
    metadata: { patch: { ...patch, dueAt: patch.dueAt?.toISOString() } },
  });
  if (patch.status === "PAID") {
    await notifySalesRep({ salesRepId: commission.salesRepId, type: "COMMISSION_PAID", title: `Commission payée : ${euros(commission.amountCents)}`, body: before.prospect.name, linkUrl: "/extranet/commissions", severity: "SUCCESS" });
  }
}

export async function listCommissionsFor(salesRepId: string) {
  const rows = await prisma.commission.findMany({ where: { salesRepId }, orderBy: { createdAt: "desc" }, include: { prospect: { select: { id: true, name: true, contracts: { where: { finalizedAt: { not: null } }, orderBy: { version: "desc" }, take: 1, select: { finalizedAt: true } } } } } });
  const now = new Date();
  const sum = (predicate: (row: (typeof rows)[number]) => boolean) => rows.filter(predicate).reduce((total, row) => total + row.amountCents, 0);
  return {
    rows,
    thisMonthCents: sum((r) => ["EARNED", "PAYABLE", "PAID"].includes(r.status) && r.createdAt.getMonth() === now.getMonth() && r.createdAt.getFullYear() === now.getFullYear()),
    earnedCents: sum((r) => r.status === "EARNED" || r.status === "PAYABLE"),
    pendingCents: sum((r) => r.status === "FORECAST"),
    paidCents: sum((r) => r.status === "PAID"),
    yearCents: sum((r) => r.status !== "CANCELLED" && r.status !== "FORECAST" && r.createdAt.getFullYear() === now.getFullYear()),
  };
}

/**
 * Les factures d'un commercial, pour sa page Commissions : numéro, date,
 * montant, statut, et rien d'autre (ni motif de refus, ni note, ni fichier).
 * Le périmètre est l'identifiant de SA session, jamais un paramètre d'URL.
 */
export async function listInvoicesFor(salesRepId: string) {
  return prisma.salesInvoice.findMany({
    where: { salesRepId },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: { id: true, number: true, issuedAt: true, amountCents: true, status: true },
  });
}
