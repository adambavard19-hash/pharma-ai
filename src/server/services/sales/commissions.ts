import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { computeCommissionCents } from "@/core/sales/commission";
import { COMMISSION_STATUS_LABELS, type CommissionStatusCode } from "@/core/sales/pipeline";
import { recordProspectEvent, type SalesActor } from "./events";
import { notifyAdmins, notifySalesRep } from "./notifications";
import type { CommissionStatus } from "@/generated/prisma";

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

/** Crée (ou met à jour) la commission d'un dossier à partir du contrat et de la règle du commercial. */
export async function upsertCommissionForContract(params: { prospectId: string; contractId: string; status: "FORECAST" | "EARNED"; actor: SalesActor }): Promise<void> {
  const contract = await prisma.contract.findUniqueOrThrow({ where: { id: params.contractId }, include: { prospect: { include: { salesRep: true } } } });
  const rep = contract.prospect.salesRep;
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

/** Modification par l'administrateur : montant, statut, date, note. Tracée et notifiée. */
export async function updateCommission(commissionId: string, patch: { amountCents?: number; status?: CommissionStatusCode; dueAt?: Date | null; note?: string | null }, adminId: string, adminLabel: string): Promise<void> {
  const before = await prisma.commission.findUniqueOrThrow({ where: { id: commissionId }, include: { prospect: { select: { name: true } } } });
  const status = (patch.status ?? before.status) as CommissionStatus;
  const commission = await prisma.commission.update({
    where: { id: commissionId },
    data: {
      ...(patch.amountCents !== undefined ? { amountCents: patch.amountCents } : {}),
      ...(patch.status ? { status } : {}),
      ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.status === "PAID" ? { paidAt: new Date() } : {}),
    },
  });
  const actor: SalesActor = { type: "ADMIN", id: adminId, label: adminLabel };
  await recordProspectEvent({
    prospectId: commission.prospectId,
    type: patch.status === "PAID" ? "COMMISSION_PAID" : "COMMISSION_UPDATED",
    summary: patch.status === "PAID" ? `Commission ${euros(commission.amountCents)} payée.` : `Commission mise à jour : ${euros(commission.amountCents)} — ${COMMISSION_STATUS_LABELS[commission.status as CommissionStatusCode]}.`,
    actor,
    metadata: { before: { amountCents: before.amountCents, status: before.status }, after: { amountCents: commission.amountCents, status: commission.status } },
  });
  await recordAudit({ action: "sales.commission_updated", entityType: "Commission", entityId: commissionId, platformAdminId: adminId, metadata: { patch: { ...patch, dueAt: patch.dueAt?.toISOString() } } });
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
