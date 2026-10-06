import "server-only";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { getStorageProvider } from "@/server/ai/registry";
import { COMMISSION_STATUS_LABELS, type CommissionStatusCode } from "@/core/sales/pipeline";
import {
  INVOICE_DELETE_REFUSAL,
  INVOICE_FILE_MIME,
  INVOICE_STATUSES,
  applyInvoiceGesture,
  canDeleteInvoice,
  commissionStatusAfterInvoiceGesture,
  compareInvoiceToCommissions,
  invoiceStorageKey,
  isInvoiceKeyOf,
  isInvoiceable,
  sanitizeInvoiceFileName,
  validateReason,
  type InvoiceDraft,
  type InvoiceGesture,
  type InvoiceStatus,
} from "@/core/sales/director/invoice";
import { applyCommissionGesture, monthBounds, summarizeCommissions, type CommissionGesture } from "@/core/sales/director/money";
import { CommissionChangedError, CommissionInvoicedError, updateCommission } from "./commissions";
import { recordProspectEvent, type SalesActor } from "./events";
import { notifySalesRep } from "./notifications";
import { formatCents } from "@/lib/format";

/**
 * Commissions et factures, côté direction commerciale.
 *
 * Chaque geste part de l'identité du directeur lue dans SA session (`director`),
 * jamais d'un champ de formulaire ; chaque identifiant reçu (commission,
 * facture, commercial) est relu en base avant d'agir. Un geste est tracé dans
 * l'audit (`salesDirectorId`), sur l'historique du dossier touché, et le
 * commercial concerné en est informé dans son extranet.
 *
 * Aucune donnée d'officine n'est lue ici : le nom et la ville du dossier
 * suffisent à reconnaître une commission. Ni contrat, ni pièce, ni patient.
 */

export type DirectorRef = { id: string; label: string };
/** Un refus lisible ; `field` dit, quand il y en a un, le champ du formulaire à corriger. */
export type Refusal = { ok: false; error: string; field?: string };

const refuse = (error: string, field?: string): Refusal => ({ ok: false, error, ...(field ? { field } : {}) });
const euros = (cents: number) => formatCents(cents);
const repName = (rep: { firstName: string; lastName: string }) => `${rep.firstName} ${rep.lastName}`;
const actorOf = (director: DirectorRef): SalesActor => ({ type: "DIRECTOR", id: director.id, label: director.label });
const isUniqueViolation = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

/** Un effet secondaire (historique, notification) ne défait jamais un geste déjà accompli : on le consigne. */
async function quietly(label: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`[direction commerciale] ${label} impossible`, error);
  }
}

// ---------------------------------------------------------------- Commerciaux

export type RepOption = { id: string; name: string; isActive: boolean };

/** Tous les commerciaux, les actifs d'abord : pour les filtres et le choix d'une facture. */
export async function listRepOptions(): Promise<RepOption[]> {
  const reps = await prisma.salesRep.findMany({ orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, isActive: true } });
  return reps.map((rep) => ({ id: rep.id, name: repName(rep), isActive: rep.isActive }));
}

// ---------------------------------------------------------------- Commissions

export const COMMISSIONS_PAGE_SIZE = 50;

export type CommissionFilters = { salesRepId?: string | null; status?: CommissionStatusCode | null; month?: string | null; page?: number };

export type DirectorCommissionRow = {
  id: string;
  amountCents: number;
  status: CommissionStatusCode;
  createdAt: Date;
  dueAt: Date | null;
  paidAt: Date | null;
  note: string | null;
  prospect: { id: string; name: string; city: string | null };
  rep: { id: string; name: string };
  invoice: { id: string; number: string; status: InvoiceStatus } | null;
};

/**
 * Toutes les commissions de l'équipe. Les totaux tiennent compte du commercial
 * et du mois choisis, mais pas du statut : ils restent les mêmes d'une pastille
 * à l'autre. Le mois est celui de la création de la commission (heure de Paris).
 */
export async function listDirectorCommissions(filters: CommissionFilters = {}) {
  const bounds = filters.month ? monthBounds(filters.month) : null;
  const base: Prisma.CommissionWhereInput = {
    ...(filters.salesRepId ? { salesRepId: filters.salesRepId } : {}),
    ...(bounds ? { createdAt: { gte: bounds.start, lt: bounds.end } } : {}),
  };
  const where: Prisma.CommissionWhereInput = { ...base, ...(filters.status ? { status: filters.status } : {}) };

  const [groups, filteredTotal, reps] = await Promise.all([
    prisma.commission.groupBy({ by: ["salesRepId", "status"], where: base, _sum: { amountCents: true }, _count: { _all: true } }),
    prisma.commission.count({ where }),
    listRepOptions(),
  ]);
  const summary = summarizeCommissions(groups.map((group) => ({ salesRepId: group.salesRepId, status: group.status, count: group._count._all, cents: group._sum.amountCents ?? 0 })));
  const names = new Map(reps.map((rep) => [rep.id, rep.name]));

  const pageCount = Math.max(1, Math.ceil(filteredTotal / COMMISSIONS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1) || 1), pageCount);
  const found = await prisma.commission.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * COMMISSIONS_PAGE_SIZE,
    take: COMMISSIONS_PAGE_SIZE,
    include: { prospect: { select: { id: true, name: true, city: true } }, salesRep: { select: { id: true, firstName: true, lastName: true } }, invoice: { select: { id: true, number: true, status: true } } },
  });

  const rows: DirectorCommissionRow[] = found.map((row) => ({
    id: row.id,
    amountCents: row.amountCents,
    status: row.status as CommissionStatusCode,
    createdAt: row.createdAt,
    dueAt: row.dueAt,
    paidAt: row.paidAt,
    note: row.note,
    prospect: row.prospect,
    rep: { id: row.salesRep.id, name: repName(row.salesRep) },
    invoice: row.invoice ? { id: row.invoice.id, number: row.invoice.number, status: row.invoice.status as InvoiceStatus } : null,
  }));

  return {
    rows,
    byStatus: summary.byStatus,
    byRep: summary.byRep.map((total) => ({ ...total, name: names.get(total.salesRepId) ?? "Commercial supprimé" })),
    reps,
    filteredTotal,
    page,
    pageCount,
    pageSize: COMMISSIONS_PAGE_SIZE,
  };
}

const GESTURE_MESSAGES: Record<CommissionGesture, string> = {
  VALIDATE: "Commission validée : elle est à payer.",
  PAY: "Commission marquée payée. Le commercial en est informé.",
  CANCEL: "Commission annulée. Le commercial en est informé.",
};

/**
 * « Valider », « Marquer payée » ou « Annuler » une commission. La commission
 * est relue en base ; le geste doit être permis depuis son statut ; une
 * commission réclamée par une facture se règle par la facture, pas à part ;
 * l'annulation exige un motif, gardé dans la note de la commission.
 */
export async function moveCommission(params: { commissionId: string; gesture: CommissionGesture; reason?: string | null }, director: DirectorRef): Promise<{ ok: true; status: CommissionStatusCode; message: string } | Refusal> {
  const commission = await prisma.commission.findUnique({ where: { id: params.commissionId }, include: { prospect: { select: { name: true } }, invoice: { select: { number: true } } } });
  if (!commission) return refuse("Commission introuvable.");

  const move = applyCommissionGesture(commission.status as CommissionStatusCode, params.gesture);
  if (!move.ok) return refuse(move.error);
  if (commission.invoice) {
    return refuse(`Cette commission figure sur la facture ${commission.invoice.number} : validez, payez ou refusez cette facture plutôt que la commission.`);
  }

  const actor = { type: "DIRECTOR", id: director.id, label: director.label } as const;
  try {
    if (params.gesture === "CANCEL") {
      const reason = validateReason(params.reason);
      if (!reason.ok) return refuse(reason.error);
      const stamp = `Annulée : ${reason.reason}`;
      await updateCommission(commission.id, { status: "CANCELLED", note: commission.note ? `${commission.note}\n${stamp}` : stamp }, actor);
      await quietly("notification d'annulation", () =>
        notifySalesRep({ salesRepId: commission.salesRepId, type: "COMMISSION_CANCELLED", title: `Commission annulée : ${euros(commission.amountCents)}`, body: `${commission.prospect.name}. Motif : ${reason.reason}`, linkUrl: "/extranet/commissions", severity: "WARNING" }),
      );
    } else {
      await updateCommission(commission.id, { status: move.to }, actor);
    }
  } catch (error) {
    // Un autre geste a eu lieu entre la lecture et l'écriture, ou la commission vient d'être réclamée par une facture : on le dit, sans rien écrire.
    if (error instanceof CommissionChangedError || error instanceof CommissionInvoicedError) return refuse(error.message);
    throw error;
  }
  return { ok: true, status: move.to, message: GESTURE_MESSAGES[params.gesture] };
}

export const COMMISSION_NOTE_MAX = 500;

/** Modifie la note d'une commission (vide : la note est retirée). */
export async function setCommissionNote(commissionId: string, note: string, director: DirectorRef): Promise<{ ok: true } | Refusal> {
  const text = note.trim();
  if (text.length > COMMISSION_NOTE_MAX) return refuse(`La note est trop longue (${COMMISSION_NOTE_MAX} caractères au plus).`);
  const commission = await prisma.commission.findUnique({ where: { id: commissionId }, select: { id: true } });
  if (!commission) return refuse("Commission introuvable.");
  await updateCommission(commission.id, { note: text || null }, { type: "DIRECTOR", id: director.id, label: director.label });
  return { ok: true };
}

// ------------------------------------------------------------------- Factures

export const INVOICES_PAGE_SIZE = 25;

export type InvoiceFilters = { salesRepId?: string | null; status?: InvoiceStatus | null; page?: number };

export type DirectorInvoiceRow = {
  id: string;
  number: string;
  amountCents: number;
  issuedAt: Date;
  periodLabel: string | null;
  status: InvoiceStatus;
  hasFile: boolean;
  commissionCount: number;
  rep: { id: string; name: string };
};

/** La liste des factures, avec les totaux « à valider », « à payer » et « payées ». */
export async function listDirectorInvoices(filters: InvoiceFilters = {}) {
  const base: Prisma.SalesInvoiceWhereInput = filters.salesRepId ? { salesRepId: filters.salesRepId } : {};
  const where: Prisma.SalesInvoiceWhereInput = { ...base, ...(filters.status ? { status: filters.status } : {}) };

  const [groups, filteredTotal, reps] = await Promise.all([
    prisma.salesInvoice.groupBy({ by: ["status"], where: base, _sum: { amountCents: true }, _count: { _all: true } }),
    prisma.salesInvoice.count({ where }),
    listRepOptions(),
  ]);
  const byStatus = Object.fromEntries(INVOICE_STATUSES.map((status) => [status, { count: 0, cents: 0 }])) as Record<InvoiceStatus, { count: number; cents: number }>;
  for (const group of groups) {
    const status = group.status as InvoiceStatus;
    if (byStatus[status]) byStatus[status] = { count: group._count._all, cents: group._sum.amountCents ?? 0 };
  }

  const pageCount = Math.max(1, Math.ceil(filteredTotal / INVOICES_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1) || 1), pageCount);
  const found = await prisma.salesInvoice.findMany({
    where,
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * INVOICES_PAGE_SIZE,
    take: INVOICES_PAGE_SIZE,
    include: { salesRep: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { commissions: true } } },
  });
  const rows: DirectorInvoiceRow[] = found.map((row) => ({
    id: row.id,
    number: row.number,
    amountCents: row.amountCents,
    issuedAt: row.issuedAt,
    periodLabel: row.periodLabel,
    status: row.status as InvoiceStatus,
    hasFile: !!row.fileKey,
    commissionCount: row._count.commissions,
    rep: { id: row.salesRep.id, name: repName(row.salesRep) },
  }));

  return { rows, byStatus, reps, filteredTotal, page, pageCount, pageSize: INVOICES_PAGE_SIZE };
}

export type InvoiceCommissionLine = { id: string; amountCents: number; status: CommissionStatusCode; createdAt: Date; prospectName: string; city: string | null };

/** Les commissions qu'une facture peut encore réclamer : acquises ou à payer, libres de toute facture. */
export async function listInvoiceableCommissions(): Promise<(InvoiceCommissionLine & { salesRepId: string })[]> {
  const rows = await prisma.commission.findMany({
    where: { invoiceId: null, status: { in: ["EARNED", "PAYABLE"] } },
    orderBy: { createdAt: "asc" },
    take: 1000,
    include: { prospect: { select: { name: true, city: true } } },
  });
  return rows.map((row) => ({ id: row.id, salesRepId: row.salesRepId, amountCents: row.amountCents, status: row.status as CommissionStatusCode, createdAt: row.createdAt, prospectName: row.prospect.name, city: row.prospect.city }));
}

/** Une facture, avec ses commissions rattachées et le rapprochement des montants. Rien si elle n'existe pas. */
export async function getDirectorInvoice(id: string) {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id },
    include: {
      salesRep: { select: { id: true, firstName: true, lastName: true } },
      commissions: { orderBy: { createdAt: "asc" }, include: { prospect: { select: { name: true, city: true } } } },
    },
  });
  if (!invoice) return null;
  const commissions: InvoiceCommissionLine[] = invoice.commissions.map((row) => ({ id: row.id, amountCents: row.amountCents, status: row.status as CommissionStatusCode, createdAt: row.createdAt, prospectName: row.prospect.name, city: row.prospect.city }));
  const commissionsCents = commissions.reduce((total, row) => total + row.amountCents, 0);
  return {
    id: invoice.id,
    number: invoice.number,
    amountCents: invoice.amountCents,
    issuedAt: invoice.issuedAt,
    periodLabel: invoice.periodLabel,
    status: invoice.status as InvoiceStatus,
    note: invoice.note,
    rejectionReason: invoice.rejectionReason,
    hasFile: !!invoice.fileKey,
    fileName: invoice.fileName,
    createdAt: invoice.createdAt,
    createdByLabel: invoice.createdByLabel,
    approvedAt: invoice.approvedAt,
    paidAt: invoice.paidAt,
    // Un refus est définitif : la dernière modification de la facture est donc la date du refus.
    rejectedAt: invoice.status === "REJECTED" ? invoice.updatedAt : null,
    rep: { id: invoice.salesRep.id, name: repName(invoice.salesRep) },
    commissions,
    commissionsCents,
    gap: compareInvoiceToCommissions(invoice.amountCents, commissionsCents, commissions.length),
  };
}

/**
 * Enregistre une facture reçue d'un commercial : numéro unique pour ce
 * commercial, commissions rattachées relues en base (elles doivent être à lui,
 * acquises ou à payer, et libres), fichier PDF facultatif rangé dans le
 * stockage privé. Tout ou rien : si le fichier ne peut pas être gardé, la
 * facture n'est pas créée.
 */
export async function createInvoice(
  input: { salesRepId: string; commissionIds: string[]; draft: InvoiceDraft },
  file: { bytes: Uint8Array; fileName: string } | null,
  director: DirectorRef,
): Promise<{ ok: true; id: string; number: string; file: "none" | "saved" } | Refusal> {
  const rep = await prisma.salesRep.findUnique({ where: { id: input.salesRepId }, select: { id: true, firstName: true, lastName: true } });
  if (!rep) return refuse("Commercial introuvable.");
  const { draft } = input;
  const duplicateMessage = `Une facture « ${draft.number} » existe déjà pour ${repName(rep)}. Le numéro doit être unique pour chaque commercial.`;

  const sameNumber = await prisma.salesInvoice.findFirst({ where: { salesRepId: rep.id, number: { equals: draft.number, mode: "insensitive" } }, select: { id: true } });
  if (sameNumber) return refuse(duplicateMessage, "number");

  const ids = [...new Set(input.commissionIds)];
  let commissions: { id: string; prospectId: string; amountCents: number; status: string; invoiceId: string | null }[] = [];
  if (ids.length > 0) {
    commissions = await prisma.commission.findMany({ where: { id: { in: ids }, salesRepId: rep.id }, select: { id: true, prospectId: true, amountCents: true, status: true, invoiceId: true } });
    if (commissions.length !== ids.length || commissions.some((commission) => !isInvoiceable(commission))) {
      return refuse("Une des commissions choisies n'est plus disponible pour cette facture. Rechargez la page et choisissez à nouveau.");
    }
  }

  let invoiceId: string;
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      const created = await tx.salesInvoice.create({
        data: {
          salesRepId: rep.id,
          number: draft.number,
          amountCents: draft.amountCents,
          issuedAt: draft.issuedAt,
          periodLabel: draft.periodLabel,
          note: draft.note,
          createdByType: "DIRECTOR",
          createdById: director.id,
          createdByLabel: director.label,
        },
        select: { id: true },
      });
      if (ids.length > 0) {
        // Le « invoiceId: null » protège d'une facture concurrente : une commission ne figure que sur une facture.
        const linked = await tx.commission.updateMany({ where: { id: { in: ids }, salesRepId: rep.id, invoiceId: null, status: { in: ["EARNED", "PAYABLE"] } }, data: { invoiceId: created.id } });
        if (linked.count !== ids.length) throw new Error("COMMISSIONS_CHANGED");
      }
      return created.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return refuse(duplicateMessage, "number");
    if (error instanceof Error && error.message === "COMMISSIONS_CHANGED") return refuse("Une des commissions choisies vient d'être rattachée à une autre facture. Rechargez la page et choisissez à nouveau.");
    throw error;
  }

  if (file) {
    const key = invoiceStorageKey(invoiceId);
    let stored = false;
    try {
      await getStorageProvider().put(key, file.bytes, INVOICE_FILE_MIME);
      stored = true;
      await prisma.salesInvoice.update({ where: { id: invoiceId }, data: { fileKey: key, fileName: file.fileName } });
    } catch (error) {
      console.error("[direction commerciale] fichier de facture impossible à garder", error);
      if (stored) await quietly("nettoyage du fichier", () => getStorageProvider().delete(key));
      // Les commissions se détachent d'elles-mêmes (la suppression ne les efface pas).
      await quietly("annulation de la facture", () => prisma.salesInvoice.delete({ where: { id: invoiceId } }));
      return refuse("Le fichier n'a pas pu être enregistré, donc la facture n'a pas été créée. Réessayez, ou enregistrez-la sans fichier.");
    }
  }

  await recordAudit({
    action: "sales.invoice_created",
    entityType: "SalesInvoice",
    entityId: invoiceId,
    salesDirectorId: director.id,
    metadata: { salesRepId: rep.id, number: draft.number, amountCents: draft.amountCents, commissionIds: ids, hasFile: !!file },
  });
  for (const commission of commissions) {
    await quietly("historique du dossier", () =>
      recordProspectEvent({ prospectId: commission.prospectId, type: "COMMISSION_UPDATED", summary: `Commission ${euros(commission.amountCents)} rattachée à la facture ${draft.number}.`, actor: actorOf(director), metadata: { commissionId: commission.id, invoiceId } }),
    );
  }
  await quietly("notification du commercial", () =>
    notifySalesRep({ salesRepId: rep.id, type: "INVOICE_RECEIVED", title: `Facture ${draft.number} enregistrée`, body: `${euros(draft.amountCents)} — elle sera étudiée par la direction commerciale.`, linkUrl: "/extranet/commissions", severity: "INFO" }),
  );
  return { ok: true, id: invoiceId, number: draft.number, file: file ? "saved" : "none" };
}

const INVOICE_MESSAGES: Record<InvoiceGesture, (number: string, count: number) => string> = {
  APPROVE: (number, count) => `Facture ${number} validée.${count > 0 ? ` ${count} commission${count > 1 ? "s sont" : " est"} à payer.` : ""}`,
  PAY: (number, count) => `Facture ${number} marquée payée.${count > 0 ? ` ${count} commission${count > 1 ? "s sont payées" : " est payée"}.` : ""}`,
  REJECT: (number, count) => `Facture ${number} refusée.${count > 0 ? ` ${count} commission${count > 1 ? "s sont libérées" : " est libérée"}.` : ""}`,
};

const INVOICE_NOTIFICATIONS: Record<InvoiceGesture, { type: string; title: (number: string) => string; severity: "SUCCESS" | "WARNING" | "INFO" }> = {
  APPROVE: { type: "INVOICE_APPROVED", title: (number) => `Facture ${number} validée`, severity: "SUCCESS" },
  PAY: { type: "INVOICE_PAID", title: (number) => `Facture ${number} payée`, severity: "SUCCESS" },
  REJECT: { type: "INVOICE_REJECTED", title: (number) => `Facture ${number} refusée`, severity: "WARNING" },
};

/**
 * Valider, payer ou refuser une facture. La machine d'états décide ; le statut
 * lu en base est vérifié à l'écriture (deux directeurs sur la même facture :
 * le second reçoit « elle a changé »). Les commissions rattachées suivent : à
 * payer à la validation, payées au paiement, détachées au refus (motif
 * obligatoire). Les écarts de montant ne bloquent jamais.
 */
export async function moveInvoice(params: { invoiceId: string; gesture: InvoiceGesture; reason?: string | null }, director: DirectorRef): Promise<{ ok: true; status: InvoiceStatus; message: string } | Refusal> {
  const invoice = await prisma.salesInvoice.findUnique({ where: { id: params.invoiceId }, include: { commissions: { select: { id: true, prospectId: true, amountCents: true, status: true } } } });
  if (!invoice) return refuse("Facture introuvable.");

  const from = invoice.status as InvoiceStatus;
  const move = applyInvoiceGesture(from, params.gesture);
  if (!move.ok) return refuse(move.error);

  let reason: string | null = null;
  if (params.gesture === "REJECT") {
    const checked = validateReason(params.reason);
    if (!checked.ok) return refuse(checked.error);
    reason = checked.reason;
  }

  const now = new Date();
  const changes = invoice.commissions
    .map((commission) => ({ ...commission, from: commission.status as CommissionStatusCode, to: commissionStatusAfterInvoiceGesture(params.gesture, from, commission.status as CommissionStatusCode) }))
    .filter((change) => change.to !== change.from);

  try {
    await prisma.$transaction(async (tx) => {
      const moved = await tx.salesInvoice.updateMany({
        where: { id: invoice.id, status: from },
        data: {
          status: move.to,
          ...(params.gesture === "APPROVE" ? { approvedAt: now } : {}),
          ...(params.gesture === "PAY" ? { paidAt: now } : {}),
          ...(params.gesture === "REJECT" ? { rejectionReason: reason } : {}),
        },
      });
      if (moved.count !== 1) throw new Error("INVOICE_CHANGED");

      // Un seul passage par couple « statut de départ → statut d'arrivée ».
      const groups = new Map<string, { from: CommissionStatusCode; to: CommissionStatusCode }>();
      for (const change of changes) groups.set(`${change.from}>${change.to}`, { from: change.from, to: change.to });
      for (const group of groups.values()) {
        await tx.commission.updateMany({ where: { invoiceId: invoice.id, status: group.from }, data: { status: group.to, ...(group.to === "PAID" ? { paidAt: now } : {}) } });
      }
      if (params.gesture === "REJECT") await tx.commission.updateMany({ where: { invoiceId: invoice.id }, data: { invoiceId: null } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVOICE_CHANGED") return refuse("Cette facture vient de changer. Rechargez la page pour voir son état actuel.");
    throw error;
  }

  await recordAudit({
    action: "sales.invoice_updated",
    entityType: "SalesInvoice",
    entityId: invoice.id,
    salesDirectorId: director.id,
    metadata: { gesture: params.gesture, from, to: move.to, salesRepId: invoice.salesRepId, commissionIds: invoice.commissions.map((commission) => commission.id), ...(reason ? { reason } : {}) },
  });

  const events = params.gesture === "REJECT" ? invoice.commissions : changes;
  for (const commission of events) {
    const to = changes.find((change) => change.id === commission.id)?.to;
    const paid = to === "PAID";
    const summary =
      params.gesture === "REJECT"
        ? `Commission ${euros(commission.amountCents)} détachée de la facture ${invoice.number} (refusée).`
        : paid
          ? `Commission ${euros(commission.amountCents)} payée (facture ${invoice.number}).`
          : `Commission ${euros(commission.amountCents)} — ${COMMISSION_STATUS_LABELS[to ?? (commission.status as CommissionStatusCode)]} (facture ${invoice.number}).`;
    await quietly("historique du dossier", () =>
      recordProspectEvent({ prospectId: commission.prospectId, type: paid ? "COMMISSION_PAID" : "COMMISSION_UPDATED", summary, actor: actorOf(director), metadata: { commissionId: commission.id, invoiceId: invoice.id, gesture: params.gesture } }),
    );
  }

  const notification = INVOICE_NOTIFICATIONS[params.gesture];
  await quietly("notification du commercial", () =>
    notifySalesRep({
      salesRepId: invoice.salesRepId,
      type: notification.type,
      title: notification.title(invoice.number),
      body: params.gesture === "REJECT" ? `${euros(invoice.amountCents)}. Motif : ${reason}` : euros(invoice.amountCents),
      linkUrl: "/extranet/commissions",
      severity: notification.severity,
    }),
  );
  return { ok: true, status: move.to, message: INVOICE_MESSAGES[params.gesture](invoice.number, invoice.commissions.length) };
}

/**
 * Supprime une facture saisie par erreur : seulement « reçue » ou « refusée »
 * (une facture validée ou payée fait partie de la comptabilité). Le fichier
 * est effacé ; les commissions rattachées sont libérées.
 */
export async function deleteInvoice(invoiceId: string, director: DirectorRef): Promise<{ ok: true; number: string } | Refusal> {
  const invoice = await prisma.salesInvoice.findUnique({ where: { id: invoiceId }, include: { commissions: { select: { id: true, prospectId: true, amountCents: true } } } });
  if (!invoice) return refuse("Facture introuvable.");
  const status = invoice.status as InvoiceStatus;
  if (!canDeleteInvoice(status)) return refuse(INVOICE_DELETE_REFUSAL);

  const removed = await prisma.salesInvoice.deleteMany({ where: { id: invoice.id, status } });
  if (removed.count !== 1) return refuse("Cette facture vient de changer. Rechargez la page pour voir son état actuel.");

  if (invoice.fileKey && isInvoiceKeyOf(invoice.id, invoice.fileKey)) {
    const key = invoice.fileKey;
    await quietly("effacement du fichier", () => getStorageProvider().delete(key));
  }
  await recordAudit({
    action: "sales.invoice_deleted",
    entityType: "SalesInvoice",
    entityId: invoice.id,
    salesDirectorId: director.id,
    metadata: { salesRepId: invoice.salesRepId, number: invoice.number, amountCents: invoice.amountCents, status, commissionIds: invoice.commissions.map((commission) => commission.id) },
  });
  for (const commission of invoice.commissions) {
    await quietly("historique du dossier", () =>
      recordProspectEvent({ prospectId: commission.prospectId, type: "COMMISSION_UPDATED", summary: `Commission ${euros(commission.amountCents)} détachée de la facture ${invoice.number} (supprimée).`, actor: actorOf(director), metadata: { commissionId: commission.id, invoiceId: invoice.id } }),
    );
  }
  return { ok: true, number: invoice.number };
}

export type InvoiceFileResult = { ok: true; bytes: Uint8Array; fileName: string } | { ok: false; reason: "NOT_FOUND" | "NO_FILE" | "FILE_MISSING" | "STORAGE_UNAVAILABLE" };

/**
 * Relit le fichier d'une facture, pour son téléchargement. La clé doit être
 * celle de CETTE facture (`sales-invoices/<id>/…`). Chaque lecture est tracée.
 */
export async function readInvoiceFile(invoiceId: string, director: DirectorRef): Promise<InvoiceFileResult> {
  const invoice = await prisma.salesInvoice.findUnique({ where: { id: invoiceId }, select: { id: true, number: true, fileKey: true, fileName: true } });
  if (!invoice) return { ok: false, reason: "NOT_FOUND" };
  if (!isInvoiceKeyOf(invoice.id, invoice.fileKey)) return { ok: false, reason: "NO_FILE" };

  let bytes: Uint8Array | null;
  try {
    bytes = await getStorageProvider().read(invoice.fileKey);
  } catch {
    return { ok: false, reason: "STORAGE_UNAVAILABLE" };
  }
  if (!bytes) return { ok: false, reason: "FILE_MISSING" };

  await recordAudit({ action: "sales.invoice_updated", entityType: "SalesInvoice", entityId: invoice.id, salesDirectorId: director.id, metadata: { event: "file_downloaded", sizeBytes: bytes.length } });
  return { ok: true, bytes, fileName: sanitizeInvoiceFileName(invoice.fileName ?? `Facture ${invoice.number.replace(/[\\/]+/g, "-")}`) };
}
