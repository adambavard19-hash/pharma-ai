import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/security/password";
import { getMessagingProvider } from "@/server/ai/registry";
import { buildDirectorInvitationEmail } from "@/core/platform/sales-emails";
import { recordAudit } from "@/server/audit/log";
import { issueDirectorPasswordLink } from "@/server/services/sales/director-auth";

/**
 * Les comptes de directeur commercial, vus de la console Super Admin.
 *
 * Le Super Admin AJOUTE le compte ; le directeur choisit son mot de passe
 * depuis le lien reçu par e-mail. Le mot de passe initial est aléatoire et
 * inconnu de tous : seul le lien (à usage unique, 7 jours, empreinte seule en
 * base) permet d'en définir un. Rien de secret n'est journalisé ni affiché.
 *
 * Un refus métier (adresse déjà prise, compte introuvable) lève une
 * `SalesDirectorError` au message lisible : l'action le rend tel quel.
 */

export type SalesDirectorInput = { firstName: string; lastName: string; email: string; phone?: string | null };

/** Issue de l'envoi de l'invitation, rendue telle quelle (jamais embellie). */
export type DirectorInvitation = { status: string; detail: string };

export class SalesDirectorError extends Error {
  constructor(
    readonly code: "EMAIL_TAKEN" | "NOT_FOUND" | "INACTIVE",
    message: string,
  ) {
    super(message);
    this.name = "SalesDirectorError";
  }
}

const NOT_FOUND = () => new SalesDirectorError("NOT_FOUND", "Directeur commercial introuvable. Rechargez la page.");
const EMAIL_TAKEN = () => new SalesDirectorError("EMAIL_TAKEN", "Un directeur commercial existe déjà avec cette adresse e-mail.");

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/**
 * Envoie (ou renvoie) le lien de création du mot de passe. L'issue du
 * prestataire est rendue telle quelle ; une panne d'envoi ne fait jamais
 * tomber le geste : le compte existe, et l'invitation se renvoie d'un clic.
 * `invitedAt` ne dit « invité » que si l'e-mail est réellement parti.
 */
async function deliverInvitation(director: { id: string; email: string; firstName: string }, adminId: string): Promise<DirectorInvitation> {
  let outcome: DirectorInvitation;
  try {
    const { url, expiresAt } = await issueDirectorPasswordLink(director.id);
    const message = buildDirectorInvitationEmail({ firstName: director.firstName, url, expiresAt });
    const sent = await getMessagingProvider().sendEmail({ to: director.email, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
    outcome = { status: sent.status, detail: sent.detail };
  } catch {
    outcome = { status: "FAILED", detail: "l'envoi a échoué, renvoyez l'invitation dans un instant" };
  }
  if (outcome.status === "SENT") await prisma.salesDirector.update({ where: { id: director.id }, data: { invitedAt: new Date() } });
  await recordAudit({ action: "sales.director_invited", entityType: "SalesDirector", entityId: director.id, platformAdminId: adminId, metadata: { status: outcome.status } });
  return outcome;
}

/** Crée le compte puis envoie AUTOMATIQUEMENT l'invitation. */
export async function createSalesDirector(input: SalesDirectorInput, adminId: string): Promise<{ id: string; invitation: DirectorInvitation }> {
  const email = normalizeEmail(input.email);
  if (await prisma.salesDirector.findUnique({ where: { email }, select: { id: true } })) throw EMAIL_TAKEN();

  let created: { id: string; email: string; firstName: string };
  try {
    created = await prisma.salesDirector.create({
      data: {
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone?.trim() || null,
        isActive: true,
        createdByAdminId: adminId,
        passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
      },
      select: { id: true, email: true, firstName: true },
    });
  } catch (error) {
    // Deux créations simultanées : l'adresse est le verrou, la seconde est refusée.
    if (isUniqueViolation(error)) throw EMAIL_TAKEN();
    throw error;
  }
  await recordAudit({ action: "sales.director_created", entityType: "SalesDirector", entityId: created.id, platformAdminId: adminId, metadata: { email } });

  const invitation = await deliverInvitation(created, adminId);
  return { id: created.id, invitation };
}

/**
 * Corrige l'identité d'un directeur. Changer l'adresse invalide le lien en
 * cours (il a été envoyé à l'ANCIENNE adresse), ferme ses sessions et remet
 * l'invitation à faire : à renvoyer vers la bonne adresse.
 */
export async function updateSalesDirector(id: string, input: Partial<SalesDirectorInput>, adminId: string): Promise<{ emailChanged: boolean }> {
  const current = await prisma.salesDirector.findUnique({ where: { id }, select: { id: true, email: true, firstName: true, lastName: true, phone: true } });
  if (!current) throw NOT_FOUND();

  const data: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const wanted = { firstName: input.firstName?.trim(), lastName: input.lastName?.trim(), phone: input.phone === undefined ? undefined : input.phone?.trim() || null };
  for (const field of ["firstName", "lastName", "phone"] as const) {
    const next = wanted[field];
    if (next === undefined) continue;
    // Le prénom et le nom ne se vident pas ; seul le téléphone peut être retiré.
    if (field !== "phone" && !next) continue;
    if (next !== current[field]) {
      data[field] = next;
      changes[field] = { from: current[field], to: next };
    }
  }

  let emailChanged = false;
  if (input.email !== undefined) {
    const email = normalizeEmail(input.email);
    if (email !== current.email) {
      const taken = await prisma.salesDirector.findUnique({ where: { email }, select: { id: true } });
      if (taken && taken.id !== id) throw EMAIL_TAKEN();
      data.email = email;
      data.invitedAt = null;
      data.passwordResetTokenHash = null;
      data.passwordResetExpiresAt = null;
      changes.email = { from: current.email, to: email };
      emailChanged = true;
    }
  }
  if (Object.keys(data).length === 0) return { emailChanged: false };

  try {
    await prisma.salesDirector.update({ where: { id }, data });
  } catch (error) {
    if (isUniqueViolation(error)) throw EMAIL_TAKEN();
    throw error;
  }
  if (emailChanged) await prisma.salesDirectorSession.updateMany({ where: { salesDirectorId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit({ action: "sales.director_updated", entityType: "SalesDirector", entityId: id, platformAdminId: adminId, metadata: { fields: Object.keys(changes), changes } });
  return { emailChanged };
}

/** Active ou désactive un compte. Désactiver ferme ses sessions : il est dehors immédiatement. */
export async function setSalesDirectorActive(id: string, isActive: boolean, adminId: string): Promise<{ changed: boolean }> {
  const current = await prisma.salesDirector.findUnique({ where: { id }, select: { id: true, isActive: true } });
  if (!current) throw NOT_FOUND();
  if (current.isActive === isActive) return { changed: false };

  // Écriture conditionnée à l'état relu : si un autre geste a eu lieu entre-temps, rien n'est écrit.
  // Désactiver efface aussi le lien de mot de passe : réactiver n'en ressuscite aucun ancien, il faut « Renvoyer l'invitation ».
  const { count } = await prisma.salesDirector.updateMany({ where: { id, isActive: current.isActive }, data: { isActive, ...(isActive ? {} : { passwordResetTokenHash: null, passwordResetExpiresAt: null }) } });
  if (count === 0) return { changed: false };
  if (!isActive) await prisma.salesDirectorSession.updateMany({ where: { salesDirectorId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit({ action: "sales.director_updated", entityType: "SalesDirector", entityId: id, platformAdminId: adminId, metadata: { fields: ["isActive"], changes: { isActive: { from: current.isActive, to: isActive } } } });
  return { changed: true };
}

/** Renvoie l'invitation (nouveau lien, le précédent ne fonctionne plus). Un compte désactivé ne peut pas l'utiliser : refus. */
export async function resendDirectorInvitation(id: string, adminId: string): Promise<DirectorInvitation> {
  const director = await prisma.salesDirector.findUnique({ where: { id }, select: { id: true, email: true, firstName: true, isActive: true } });
  if (!director) throw NOT_FOUND();
  if (!director.isActive) throw new SalesDirectorError("INACTIVE", "Ce compte est désactivé : réactivez-le avant de renvoyer l'invitation.");
  return deliverInvitation(director, adminId);
}

/**
 * Supprime définitivement le compte (ses sessions partent avec lui). Ses gestes
 * passés restent dans le journal d'audit et sur les dossiers, signés de son nom.
 */
export async function deleteSalesDirector(id: string, adminId: string): Promise<void> {
  const director = await prisma.salesDirector.findUnique({ where: { id }, select: { id: true, email: true, firstName: true, lastName: true, isActive: true } });
  if (!director) throw NOT_FOUND();
  try {
    await prisma.salesDirector.delete({ where: { id } });
  } catch (error) {
    // Supprimé entre-temps par un autre administrateur.
    if ((error as { code?: string }).code === "P2025") throw NOT_FOUND();
    throw error;
  }
  await recordAudit({
    action: "sales.director_deleted",
    entityType: "SalesDirector",
    entityId: id,
    platformAdminId: adminId,
    metadata: { before: { email: director.email, firstName: director.firstName, lastName: director.lastName, isActive: director.isActive } },
  });
}

export type SalesDirectorRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  invitedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  /** Fin de validité du lien en cours, quand il en existe un. */
  linkExpiresAt: Date | null;
};

/** Les directeurs, actifs d'abord. Jamais le hachage ni l'empreinte du lien. */
export async function listSalesDirectors(): Promise<SalesDirectorRow[]> {
  const rows = await prisma.salesDirector.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, isActive: true, invitedAt: true, lastLoginAt: true, createdAt: true, passwordResetExpiresAt: true },
  });
  return rows.map(({ passwordResetExpiresAt, ...row }) => ({ ...row, linkExpiresAt: passwordResetExpiresAt }));
}

/** L'équipe que le directeur voit : les commerciaux de la plateforme, ceux du Super Admin comme les siens. */
export async function salesTeamCounts(): Promise<{ active: number; total: number }> {
  const [active, total] = await Promise.all([prisma.salesRep.count({ where: { isActive: true } }), prisma.salesRep.count()]);
  return { active, total };
}

export type DirectorInvitationState = { label: string; tone: "success" | "info" | "warning" | "neutral"; hint: string | null };

/**
 * Où en est l'accès d'un directeur : jamais invité, invité (lien valable ou
 * expiré), ou déjà connecté. Pure, pour que la page ne dise que le vrai.
 */
export function directorInvitationState(row: Pick<SalesDirectorRow, "invitedAt" | "lastLoginAt" | "linkExpiresAt">, now: Date): DirectorInvitationState {
  if (row.lastLoginAt) return { label: "Connecté", tone: "success", hint: null };
  if (!row.invitedAt) return { label: "Invitation non envoyée", tone: "warning", hint: "Renvoyez l'invitation." };
  if (row.linkExpiresAt && row.linkExpiresAt.getTime() <= now.getTime()) return { label: "Lien expiré", tone: "warning", hint: "Renvoyez l'invitation." };
  return { label: "Invitation en attente", tone: "info", hint: "Il n'a pas encore choisi son mot de passe." };
}
