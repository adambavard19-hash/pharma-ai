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

export async function resendPlatformAdminLinkAction(payload: { adminId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const outcome = await sendPasswordLink(payload.adminId);
  await recordAudit({ action: "platform.admin_link_resent", entityType: "PlatformAdmin", entityId: payload.adminId, platformAdminId: session.admin.id, metadata: { status: outcome.status } });
  return outcome.status === "SENT" ? ok(null, "Lien de connexion renvoyé.") : fail(`Lien non envoyé : ${outcome.detail}`);
}

export async function setPlatformAdminActiveAction(payload: { adminId: string; isActive: boolean }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  if (payload.adminId === session.admin.id && !payload.isActive) return fail("Vous ne pouvez pas désactiver votre propre compte.");
  const admin = await prisma.platformAdmin.update({ where: { id: payload.adminId }, data: { isActive: payload.isActive } });
  if (!payload.isActive) await prisma.platformAdminSession.deleteMany({ where: { adminId: admin.id } });
  await recordAudit({ action: payload.isActive ? "platform.admin_activated" : "platform.admin_deactivated", entityType: "PlatformAdmin", entityId: admin.id, platformAdminId: session.admin.id });
  revalidatePath("/admin/equipe");
  return ok(null, payload.isActive ? "Compte réactivé." : "Compte désactivé : ses sessions sont fermées.");
}

export async function deletePlatformAdminAction(payload: { adminId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  if (payload.adminId === session.admin.id) return fail("Vous ne pouvez pas supprimer votre propre compte.");
  const count = await prisma.platformAdmin.count({ where: { isActive: true } });
  if (count <= 1) return fail("Il doit rester au moins un administrateur actif.");
  await prisma.platformAdmin.delete({ where: { id: payload.adminId } });
  await recordAudit({ action: "platform.admin_deleted", entityType: "PlatformAdmin", entityId: payload.adminId, platformAdminId: session.admin.id });
  revalidatePath("/admin/equipe");
  return ok(null, "Administrateur supprimé.");
}
