"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { sendPasswordLink } from "@/server/services/platform-admin";
import { generateToken } from "@/server/security/tokens";
import { hashPassword } from "@/server/security/password";
import { fail, ok, type ActionResult } from "./types";

const createSchema = z.object({
  email: z.string().trim().email("Adresse e-mail invalide.").max(160),
  firstName: z.string().trim().min(1, "Prénom requis.").max(80),
  lastName: z.string().trim().min(1, "Nom requis.").max(80),
});

/**
 * Un administrateur de plus sur la console : il reçoit un lien pour définir
 * son mot de passe. Aucun mot de passe ne transite par l'écran.
 */
export async function createPlatformAdminAction(payload: z.input<typeof createSchema>): Promise<ActionResult<{ sent: string }>> {
  const session = await requirePlatformSession();
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.");
  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) return fail("Un administrateur existe déjà avec cette adresse.");
  const admin = await prisma.platformAdmin.create({
    data: { email, firstName: parsed.data.firstName, lastName: parsed.data.lastName, passwordHash: await hashPassword(generateToken(24)) },
  });
  const outcome = await sendPasswordLink(admin.id);
  await recordAudit({ action: "platform.admin_created", entityType: "PlatformAdmin", entityId: admin.id, platformAdminId: session.admin.id, metadata: { email, invitation: outcome.status } });
  revalidatePath("/admin/equipe");
  return ok({ sent: outcome.status }, outcome.status === "SENT" ? `Invitation envoyée à ${email}.` : `Compte créé ; invitation ${outcome.status.toLowerCase()} : ${outcome.detail}`);
}

const adminIdSchema = z.object({ adminId: z.string().trim().min(1, "Administrateur introuvable.").max(64) });
const activeSchema = adminIdSchema.extend({ isActive: z.boolean() });

export async function resendPlatformAdminLinkAction(payload: { adminId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = adminIdSchema.safeParse(payload);
  if (!parsed.success) return fail("Administrateur introuvable.");
  // Un compte supprimé entre-temps : un refus lisible, pas une exception qui fait tomber la page.
  const target = await prisma.platformAdmin.findUnique({ where: { id: parsed.data.adminId }, select: { id: true } });
  if (!target) return fail("Administrateur introuvable.");
  const outcome = await sendPasswordLink(target.id);
  await recordAudit({ action: "platform.admin_link_resent", entityType: "PlatformAdmin", entityId: parsed.data.adminId, platformAdminId: session.admin.id, metadata: { status: outcome.status } });
  return outcome.status === "SENT" ? ok(null, "Lien de connexion renvoyé.") : fail(`Lien non envoyé : ${outcome.detail}`);
}

/**
 * Active ou désactive un administrateur. L'état est relu en base : rien n'est
 * écrit ni journalisé quand il est déjà celui demandé (page restée ouverte
 * pendant qu'un autre administrateur agissait), et le journal consigne le vrai
 * avant / après.
 */
export async function setPlatformAdminActiveAction(payload: { adminId: string; isActive: boolean }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = activeSchema.safeParse(payload);
  if (!parsed.success) return fail("Administrateur introuvable.");
  const { adminId, isActive } = parsed.data;
  if (adminId === session.admin.id && !isActive) return fail("Vous ne pouvez pas désactiver votre propre compte.");
  const target = await prisma.platformAdmin.findUnique({ where: { id: adminId }, select: { id: true, email: true, isActive: true } });
  if (!target) return fail("Administrateur introuvable.");
  if (target.isActive === isActive) {
    revalidatePath("/admin/equipe");
    return ok(null, isActive ? "Ce compte était déjà actif : rien n'a changé." : "Ce compte était déjà désactivé : rien n'a changé.");
  }
  // Écriture conditionnée à l'état relu : si un autre administrateur a agi entre-temps, rien n'est écrit.
  const { count } = await prisma.platformAdmin.updateMany({ where: { id: target.id, isActive: target.isActive }, data: { isActive } });
  if (count === 0) {
    revalidatePath("/admin/equipe");
    return fail("Ce compte vient d'être modifié ou supprimé par un autre administrateur. Rechargez la page.");
  }
  if (!isActive) await prisma.platformAdminSession.deleteMany({ where: { adminId: target.id } });
  await recordAudit({ action: isActive ? "platform.admin_activated" : "platform.admin_deactivated", entityType: "PlatformAdmin", entityId: target.id, platformAdminId: session.admin.id, metadata: { email: target.email, changes: { isActive: { from: target.isActive, to: isActive } } } });
  revalidatePath("/admin/equipe");
  return ok(null, isActive ? "Compte réactivé." : "Compte désactivé : ses sessions sont fermées.");
}

/**
 * Supprime définitivement un administrateur. Garde-fou : il doit rester au
 * moins un AUTRE compte actif — les comptes désactivés ne comptent pas, et le
 * compte supprimé non plus (il ne peut pas se garantir lui-même).
 */
export async function deletePlatformAdminAction(payload: { adminId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = adminIdSchema.safeParse(payload);
  if (!parsed.success) return fail("Administrateur introuvable.");
  const { adminId } = parsed.data;
  if (adminId === session.admin.id) return fail("Vous ne pouvez pas supprimer votre propre compte.");
  const target = await prisma.platformAdmin.findUnique({ where: { id: adminId }, select: { id: true, email: true, firstName: true, lastName: true, isActive: true } });
  if (!target) return fail("Administrateur introuvable.");
  const otherActive = await prisma.platformAdmin.count({ where: { isActive: true, id: { not: adminId } } });
  if (otherActive < 1) return fail("Il doit rester au moins un administrateur actif.");
  await prisma.platformAdmin.delete({ where: { id: adminId } });
  await recordAudit({ action: "platform.admin_deleted", entityType: "PlatformAdmin", entityId: adminId, platformAdminId: session.admin.id, metadata: { before: { email: target.email, firstName: target.firstName, lastName: target.lastName, isActive: target.isActive } } });
  revalidatePath("/admin/equipe");
  return ok(null, "Administrateur supprimé.");
}
