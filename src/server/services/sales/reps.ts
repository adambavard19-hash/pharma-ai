import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { hashPassword, validatePasswordStrength } from "@/server/security/password";
import { getMessagingProvider } from "@/server/ai/registry";
import { buildSalesInvitationEmail } from "@/core/platform/sales-emails";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import type { SalesCommissionType } from "@/generated/prisma";

const LINK_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type SalesRepInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  zone?: string | null;
  commissionType: SalesCommissionType;
  commissionValue: number;
  isActive?: boolean;
};

/** Crée un commercial. Le mot de passe initial est aléatoire et inconnu : seul le lien d'invitation permet d'en définir un. */
export async function createSalesRep(input: SalesRepInput, adminId: string): Promise<{ id: string }> {
  const rep = await prisma.salesRep.create({
    data: {
      ...input,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      zone: input.zone || null,
      isActive: input.isActive ?? true,
      passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
    },
  });
  await recordAudit({ action: "sales.rep_created", entityType: "SalesRep", entityId: rep.id, platformAdminId: adminId, metadata: { email: rep.email } });
  return { id: rep.id };
}

export async function updateSalesRep(id: string, input: Partial<SalesRepInput>, adminId: string): Promise<void> {
  await prisma.salesRep.update({ where: { id }, data: { ...input, ...(input.email ? { email: input.email.toLowerCase() } : {}) } });
  if (input.isActive === false) {
    await prisma.salesRepSession.updateMany({ where: { salesRepId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await recordAudit({ action: "sales.rep_updated", entityType: "SalesRep", entityId: id, platformAdminId: adminId, metadata: { fields: Object.keys(input) } });
}

export async function issueSalesPasswordLink(salesRepId: string): Promise<{ url: string; expiresAt: Date }> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  await prisma.salesRep.update({ where: { id: salesRepId }, data: { passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: expiresAt } });
  return { url: publicUrl(`/extranet/mot-de-passe/${token}`), expiresAt };
}

/** Envoie (ou renvoie) l'invitation. L'issue du prestataire est rendue telle quelle. */
export async function sendSalesInvitation(salesRepId: string, adminId: string | null): Promise<{ status: string; detail: string }> {
  const rep = await prisma.salesRep.findUniqueOrThrow({ where: { id: salesRepId } });
  const { url, expiresAt } = await issueSalesPasswordLink(rep.id);
  const message = buildSalesInvitationEmail({ firstName: rep.firstName, url, expiresAt });
  const outcome = await getMessagingProvider().sendEmail({ to: rep.email, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
  await prisma.salesRep.update({ where: { id: rep.id }, data: { invitedAt: new Date() } });
  await recordAudit({ action: "sales.rep_invited", entityType: "SalesRep", entityId: rep.id, platformAdminId: adminId, metadata: { status: outcome.status } });
  return { status: outcome.status, detail: outcome.detail };
}

export async function peekSalesPasswordToken(token: string): Promise<{ id: string; email: string; firstName: string } | null> {
  if (!token || token.length < 16) return null;
  const rep = await prisma.salesRep.findUnique({ where: { passwordResetTokenHash: hashToken(token) } });
  if (!rep || !rep.isActive || !rep.passwordResetExpiresAt || rep.passwordResetExpiresAt < new Date()) return null;
  return { id: rep.id, email: rep.email, firstName: rep.firstName };
}

export async function setSalesPasswordByToken(token: string, password: string): Promise<{ ok: true; salesRepId: string } | { ok: false; error: string }> {
  const found = await peekSalesPasswordToken(token);
  if (!found) return { ok: false, error: "Ce lien n'est plus valide. Demandez-en un nouveau depuis la page de connexion." };
  const problems = validatePasswordStrength(password);
  if (problems.length > 0) return { ok: false, error: problems.join(" ") };
  await prisma.$transaction([
    prisma.salesRep.update({ where: { id: found.id }, data: { passwordHash: await hashPassword(password), passwordResetTokenHash: null, passwordResetExpiresAt: null } }),
    prisma.salesRepSession.updateMany({ where: { salesRepId: found.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await recordAudit({ action: "auth.password_set", entityType: "SalesRep", entityId: found.id, salesRepId: found.id });
  return { ok: true, salesRepId: found.id };
}

/** Les chiffres d'un commercial, pour son tableau de bord et pour la console. */
export async function salesRepStats(salesRepId: string) {
  const [prospects, byStatus, commissions] = await Promise.all([
    prisma.prospect.count({ where: { salesRepId } }),
    prisma.prospect.groupBy({ by: ["status"], where: { salesRepId }, _count: { _all: true } }),
    prisma.commission.groupBy({ by: ["status"], where: { salesRepId }, _sum: { amountCents: true }, _count: { _all: true } }),
  ]);
  const count = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
  const sum = (status: string) => commissions.find((row) => row.status === status)?._sum.amountCents ?? 0;
  const open = byStatus.filter((row) => !["ACTIVATED", "LOST"].includes(row.status)).reduce((total, row) => total + row._count._all, 0);
  const signed = count("CONTRACT_SIGNED") + count("PHARMACY_CREATED") + count("ACTIVATED");
  const contractsSent = await prisma.contract.count({ where: { prospect: { salesRepId }, status: { notIn: ["DRAFT"] } } });
  return {
    prospects,
    openProspects: open,
    contractsSent,
    contractsSigned: signed,
    activated: count("ACTIVATED"),
    lost: count("LOST"),
    conversionRate: prospects > 0 ? signed / prospects : 0,
    commissionEarnedCents: sum("EARNED") + sum("PAYABLE"),
    commissionPendingCents: sum("FORECAST"),
    commissionPaidCents: sum("PAID"),
  };
}
