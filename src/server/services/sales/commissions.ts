import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { computeCommissionCents } from "@/core/sales/commission";
import { COMMISSION_STATUS_LABELS, type CommissionStatusCode } from "@/core/sales/pipeline";
import { recordProspectEvent, type SalesActor } from "./events";
import { notifyAdmins, notifySalesRep } from "./notifications";
import { activatedPharmaciesOf, progressiveAmountFor, syncProgressiveCommissionsSafely } from "./progressive-commissions";
import { preGridTiers } from "@/core/sales/progressive-commission";
import { parisMonthStart } from "@/core/sales/director/team";
import type { CommissionStatus } from "@/generated/prisma";
import { formatCents } from "@/lib/format";

const euros = (cents: number) => formatCents(cents);

/** Les statuts d'une commission acquise : « Ce mois », « Gains cumulés » et `earnedAt` les comptent. */
const ACQUIRED_STATUSES = ["EARNED", "PAYABLE", "PAID"] as const;
const isAcquired = (status: string) => (ACQUIRED_STATUSES as readonly string[]).includes(status);

/** L'avancement d'une commission : on n'y recule jamais par un contrat (une commission « à payer » ne redevient pas « acquise »). */
const STATUS_RANK: Record<string, number> = { FORECAST: 0, EARNED: 1, PAYABLE: 2 };

/**
 * Crée (ou met à jour) la commission d'un dossier à partir du contrat et de la règle du commercial.
 *
 * Grille progressive : le montant est celui du rang de la pharmacie si elle est
 * déjà activée, sinon la prévision (commission de la prochaine activation) ; le
 * recalcul de la grille suit, et corrigera le montant à l'activation.
 *
 * Une commission déjà là garde sa règle et son montant quand ils ne sont plus
 * ceux du commercial aujourd'hui : montant fixe d'avant le passage à la grille
 * (promis au commercial quand le contrat est parti), montant fixé à la main par
 * la direction, accord changé depuis. Seul son statut avance. Une commission
 * réclamée par une facture n'est jamais touchée, et le statut ne recule jamais.
 */
export async function upsertCommissionForContract(params: { prospectId: string; contractId: string; status: "FORECAST" | "EARNED"; actor: SalesActor }): Promise<void> {
  const contract = await prisma.contract.findUniqueOrThrow({ where: { id: params.contractId }, include: { prospect: { include: { salesRep: true } } } });
  const rep = contract.prospect.salesRep;
  // Dossier tenu par la console, sans commercial : aucune commission à calculer.
  if (!rep) return;
  const progressive = rep.commissionType === "PROGRESSIVE";
  // La commission du dossier, jamais un bonus de palier rattaché au même dossier.
  const existing = await prisma.commission.findFirst({ where: { prospectId: params.prospectId, status: { in: ["FORECAST", "EARNED", "PAYABLE"] }, type: { not: "BONUS" } } });
  // Un affilié n'a rien à toucher au contrat : ses commissions naissent chaque mois, tant que la pharmacie reste abonnée
  // (`affiliate-commissions.ts`). Une commission d'avant son passage à l'affiliation garde, elle, son montant ; seul son statut avance.
  if (rep.commissionType === "AFFILIATE" && !existing) return;
  // Réclamée par une facture : elle se règle par la facture, jamais par un contrat.
  if (existing?.invoiceId) {
    if (progressive) await syncProgressiveCommissionsSafely(rep.id, "contrat");
    return;
  }
  const keepRule = existing !== null && existing.type !== rep.commissionType;
  const amountCents = keepRule
    ? existing.amountCents
    : progressive
      ? await progressiveAmountFor(rep.id, params.prospectId)
      : computeCommissionCents({ type: rep.commissionType, value: rep.commissionValue }, { monthlyPriceCents: contract.monthlyPriceCents, durationMonths: contract.durationMonths });
  const held = existing !== null && (STATUS_RANK[existing.status] ?? 0) > STATUS_RANK[params.status];
  const status = held ? (existing.status as CommissionStatus) : params.status;
  const now = new Date();
  const dueAt = held ? existing.dueAt : params.status === "EARNED" ? endOfNextMonth(now) : (existing?.dueAt ?? null);
  const earnedAt = isAcquired(status) ? (existing?.earnedAt ?? now) : null;
  const commission = existing
    ? await prisma.commission.update({ where: { id: existing.id }, data: { amountCents, status, salesRepId: rep.id, type: keepRule ? existing.type : rep.commissionType, dueAt, earnedAt } })
    : await prisma.commission.create({ data: { prospectId: params.prospectId, salesRepId: rep.id, type: rep.commissionType, amountCents, status, dueAt, earnedAt } });
  await recordProspectEvent({
    prospectId: params.prospectId,
    type: existing ? "COMMISSION_UPDATED" : "COMMISSION_CREATED",
    summary: `Commission ${euros(amountCents)} — ${COMMISSION_STATUS_LABELS[status as CommissionStatusCode]}${keepRule ? " (règle d'origine gardée : montant inchangé)" : ""}.`,
    actor: params.actor,
    metadata: { commissionId: commission.id, amountCents, status, ...(keepRule ? { keptType: existing.type } : {}) },
  });
  if (params.status === "EARNED" && !(existing && isAcquired(existing.status))) {
    await notifySalesRep({ salesRepId: rep.id, type: "COMMISSION_EARNED", title: `Commission acquise : ${euros(amountCents)}`, body: `${contract.prospect.name} — contrat finalisé.`, linkUrl: "/extranet/commissions", severity: "SUCCESS" });
    if (amountCents >= 50_000) await notifyAdmins({ type: "COMMISSION_LARGE", title: `Commission importante : ${euros(amountCents)}`, body: `${rep.firstName} ${rep.lastName} — ${contract.prospect.name}.`, linkUrl: `/admin/dossiers/${params.prospectId}`, severity: "WARNING" });
  }
  if (progressive) await syncProgressiveCommissionsSafely(rep.id, "contrat");
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
  // Un montant saisi à la main sur une commission de la grille progressive est une décision : la commission passe en
  // montant fixe, pour que le recalcul de la grille ne l'écrase jamais.
  const pinned = patch.amountCents !== undefined && patch.amountCents !== before.amountCents && before.type === "PROGRESSIVE";
  // La date d'acquisition (« Ce mois ») : posée quand la commission devient acquise, retirée si elle redevient prévisionnelle.
  const becomesAcquired = patch.status !== undefined && isAcquired(patch.status) && !isAcquired(before.status);
  const backToForecast = patch.status === "FORECAST" && before.status !== "FORECAST";
  // Écriture conditionnée au statut relu : deux gestes quasi simultanés ne s'écrasent pas (le second est refusé, sans doublon d'événement ni de notification).
  const written = await prisma.commission.updateMany({
    where: { id: commissionId, status: before.status },
    data: {
      ...(patch.amountCents !== undefined ? { amountCents: patch.amountCents } : {}),
      ...(pinned ? { type: "FIXED" as const } : {}),
      ...(patch.status ? { status } : {}),
      ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.status === "PAID" ? { paidAt: new Date() } : {}),
      ...(becomesAcquired ? { earnedAt: new Date() } : {}),
      ...(backToForecast ? { earnedAt: null } : {}),
    },
  });
  if (written.count !== 1) throw new CommissionChangedError();
  const commission = await prisma.commission.findUniqueOrThrow({ where: { id: commissionId } });
  const salesActor: SalesActor = { type: actor.type, id: actor.id, label: actor.label };
  await recordProspectEvent({
    prospectId: commission.prospectId,
    type: patch.status === "PAID" ? "COMMISSION_PAID" : "COMMISSION_UPDATED",
    summary: patch.status === "PAID" ? `Commission ${euros(commission.amountCents)} payée.` : `Commission mise à jour : ${euros(commission.amountCents)} — ${COMMISSION_STATUS_LABELS[commission.status as CommissionStatusCode]}${pinned ? " (montant fixé à la main : la grille progressive ne le recalcule plus)" : ""}.`,
    actor: salesActor,
    metadata: { before: { amountCents: before.amountCents, status: before.status, type: before.type }, after: { amountCents: commission.amountCents, status: commission.status, type: commission.type } },
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

/**
 * Les commissions d'un commercial, pour sa page : les plus récentes d'abord
 * (et, pour des bonus créés ensemble, le palier le plus haut d'abord).
 * « Ce mois » compte ce qui est devenu ACQUIS ce mois-ci (heure de Paris),
 * d'après la date d'acquisition, pas la création de la ligne prévisionnelle.
 */
export async function listCommissionsFor(salesRepId: string) {
  const rows = await prisma.commission.findMany({ where: { salesRepId }, orderBy: [{ createdAt: "desc" }, { bonusTier: { sort: "desc", nulls: "last" } }], include: { prospect: { select: { id: true, name: true, activatedAt: true, contracts: { where: { finalizedAt: { not: null } }, orderBy: { version: "desc" }, take: 1, select: { finalizedAt: true } } } } } });
  const now = new Date();
  const monthStart = parisMonthStart(now);
  const acquiredAt = (row: (typeof rows)[number]) => row.earnedAt ?? row.createdAt;
  const sum = (predicate: (row: (typeof rows)[number]) => boolean) => rows.filter(predicate).reduce((total, row) => total + row.amountCents, 0);
  return {
    rows,
    thisMonthCents: sum((r) => isAcquired(r.status) && acquiredAt(r) >= monthStart),
    earnedCents: sum((r) => r.status === "EARNED" || r.status === "PAYABLE"),
    pendingCents: sum((r) => r.status === "FORECAST"),
    paidCents: sum((r) => r.status === "PAID"),
    yearCents: sum((r) => isAcquired(r.status) && acquiredAt(r).getFullYear() === now.getFullYear()),
  };
}

/**
 * Ce que la page Commissions d'un commercial montre de sa grille : sa règle,
 * ses pharmacies activées (celles qui lui sont créditées, total historique
 * dans l'ordre d'activation) et les paliers de bonus atteints avant son
 * passage à la grille. Le périmètre est l'identifiant de SA session, jamais un
 * paramètre d'URL.
 */
export async function commissionOverviewFor(salesRepId: string) {
  const [rep, activations] = await Promise.all([prisma.salesRep.findUniqueOrThrow({ where: { id: salesRepId }, select: { commissionType: true, commissionValue: true, progressiveSince: true } }), activatedPharmaciesOf(salesRepId)]);
  return {
    rule: { type: rep.commissionType, value: rep.commissionValue },
    activations: activations.map((activation) => ({ prospectId: activation.prospectId, name: activation.name, at: activation.at, rank: activation.rank })),
    beforeGridTiers: rep.commissionType === "PROGRESSIVE" ? preGridTiers(activations, rep.progressiveSince).map((tier) => tier.at) : [],
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
