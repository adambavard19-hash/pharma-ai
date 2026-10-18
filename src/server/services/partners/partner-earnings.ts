import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";

/**
 * La rémunération de PharmaBoost par partenaire (17 oct. 2026) : ce qui a été reçu (saisi à la réception du relevé ou du virement),
 * et l'activité qui la produit — les e-mails patients de ses marques (envois, clics vers son lien d'affiliation).
 */

export const EARNING_KINDS = [
  { key: "AFFILIATION", label: "Commission d'affiliation (e-mails patients)" },
  { key: "FORFAIT", label: "Forfait de partenariat" },
  { key: "COMMANDES", label: "Commission sur commandes des officines" },
  { key: "AUTRE", label: "Autre" },
] as const;

export type EarningKind = (typeof EARNING_KINDS)[number]["key"];

export async function partnerMoney(partnerId: string, now = new Date()) {
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [earnings, campaigns] = await Promise.all([
    prisma.partnerEarning.findMany({ where: { partnerId }, orderBy: { receivedOn: "desc" }, take: 100 }),
    prisma.partnerEmailCampaign.findMany({ where: { brand: { partnerId } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, subject: true, status: true, sentAt: true, recipients: true, brand: { select: { name: true } } } }),
  ]);
  const sum = (from?: Date) => earnings.filter((e) => !from || e.receivedOn >= from).reduce((total, e) => total + e.amountCents, 0);
  const clicks = campaigns.length ? await prisma.partnerEmailSend.groupBy({ by: ["campaignId"], where: { campaignId: { in: campaigns.map((c) => c.id) }, clickedAt: { not: null } }, _count: { _all: true } }) : [];
  const clicksBy = new Map(clicks.map((row) => [row.campaignId, row._count._all]));
  return {
    totalCents: sum(),
    yearCents: sum(yearStart),
    monthCents: sum(monthStart),
    earnings: earnings.map((e) => ({ id: e.id, kind: e.kind, amountCents: e.amountCents, receivedOn: e.receivedOn, note: e.note, createdByName: e.createdByName })),
    campaigns: campaigns.map((c) => ({ ...c, clicks: clicksBy.get(c.id) ?? 0 })),
    sent: campaigns.reduce((total, c) => total + c.recipients, 0),
    clicks: campaigns.reduce((total, c) => total + (clicksBy.get(c.id) ?? 0), 0),
  };
}

export async function addPartnerEarning(admin: { fullName: string }, input: { partnerId: string; kind: string; amountCents: number; receivedOn: string; note: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!EARNING_KINDS.some((k) => k.key === input.kind)) return { ok: false, error: "Type de rémunération inconnu." };
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 100_000_000) return { ok: false, error: "Montant invalide." };
  const day = /^\d{4}-\d{2}-\d{2}$/.test(input.receivedOn) ? new Date(`${input.receivedOn}T12:00:00Z`) : null;
  if (!day || Number.isNaN(day.getTime())) return { ok: false, error: "Date invalide." };
  const partner = await prisma.partner.findUnique({ where: { id: input.partnerId }, select: { id: true } });
  if (!partner) return { ok: false, error: "Partenaire inconnu." };
  const created = await prisma.partnerEarning.create({ data: { partnerId: input.partnerId, kind: input.kind, amountCents: input.amountCents, receivedOn: day, note: input.note?.trim().slice(0, 300) || null, createdByName: admin.fullName }, select: { id: true } });
  await recordAudit({ action: "partner_earning.added", entityType: "PartnerEarning", entityId: created.id, metadata: { partnerId: input.partnerId, amountCents: input.amountCents, kind: input.kind } });
  return { ok: true };
}

export async function removePartnerEarning(id: string): Promise<void> {
  await prisma.partnerEarning.deleteMany({ where: { id } });
  await recordAudit({ action: "partner_earning.removed", entityType: "PartnerEarning", entityId: id });
}

/** Le compteur du tableau de bord : les partenaires actifs (et tous), et ce qu'ils ont rapporté depuis le début de l'année. */
export async function partnersOverview(now = new Date()) {
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const [active, total, year] = await Promise.all([
    prisma.partner.count({ where: { status: "ACTIVE" } }),
    prisma.partner.count({ where: { status: { not: "ARCHIVED" } } }),
    prisma.partnerEarning.aggregate({ where: { receivedOn: { gte: yearStart } }, _sum: { amountCents: true } }),
  ]);
  return { active, total, yearCents: year._sum.amountCents ?? 0 };
}
