import "server-only";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { hashPassword, validatePasswordStrength } from "@/server/security/password";
import { getMessagingProvider } from "@/server/ai/registry";
import { buildAdminPasswordEmail } from "@/core/platform/reset-email";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";

/** Un lien de définition de mot de passe reste valable une semaine. */
const PASSWORD_LINK_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Le lien « définir mon mot de passe » d'un administrateur de la console.
 *
 * Le jeton en clair ne vit que dans l'e-mail ; la base n'en garde que
 * l'empreinte. Émettre un nouveau lien invalide le précédent.
 */
export async function issuePasswordLink(adminId: string): Promise<{ url: string; expiresAt: Date }> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + PASSWORD_LINK_TTL_MS);
  await prisma.platformAdmin.update({
    where: { id: adminId },
    data: { passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: expiresAt },
  });
  return { url: publicUrl(`/admin-connexion/mot-de-passe/${token}`), expiresAt };
}

/** Envoie le lien à l'adresse du compte. Renvoie l'issue réelle du prestataire. */
export async function sendPasswordLink(adminId: string): Promise<{ status: string; detail: string; url: string }> {
  const admin = await prisma.platformAdmin.findUniqueOrThrow({ where: { id: adminId } });
  const { url, expiresAt } = await issuePasswordLink(admin.id);
  const message = buildAdminPasswordEmail({ fullName: `${admin.firstName} ${admin.lastName}`, url, expiresAt });
  const outcome = await getMessagingProvider().sendEmail({
    to: admin.email,
    fromName: "PharmaBoost",
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  await recordAudit({
    action: "auth.password_link_sent",
    entityType: "PlatformAdmin",
    entityId: admin.id,
    platformAdminId: admin.id,
    metadata: { status: outcome.status, provider: outcome.provider },
  });
  return { status: outcome.status, detail: outcome.detail, url };
}

/** Le compte derrière un jeton valide, sans rien modifier. */
export async function peekPasswordToken(token: string): Promise<{ adminId: string; email: string; fullName: string } | null> {
  if (!token || token.length < 16) return null;
  const admin = await prisma.platformAdmin.findUnique({ where: { passwordResetTokenHash: hashToken(token) } });
  if (!admin || !admin.isActive || !admin.passwordResetExpiresAt || admin.passwordResetExpiresAt < new Date()) return null;
  return { adminId: admin.id, email: admin.email, fullName: `${admin.firstName} ${admin.lastName}` };
}

/**
 * Définit le mot de passe depuis un lien. Le jeton est consommé, et toutes les
 * sessions ouvertes du compte sont fermées : un mot de passe qui change ferme
 * les portes derrière lui.
 */
export async function setPasswordByToken(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const found = await peekPasswordToken(token);
  if (!found) return { ok: false, error: "Ce lien n'est plus valide. Demandez-en un nouveau depuis la page de connexion." };
  const problems = validatePasswordStrength(password);
  if (problems.length > 0) return { ok: false, error: problems.join(" ") };

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.platformAdmin.update({
      where: { id: found.adminId },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
    }),
    prisma.platformAdminSession.updateMany({ where: { adminId: found.adminId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await recordAudit({
    action: "auth.password_set",
    entityType: "PlatformAdmin",
    entityId: found.adminId,
    platformAdminId: found.adminId,
  });
  return { ok: true };
}
