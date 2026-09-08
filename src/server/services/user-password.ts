import "server-only";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { hashPassword, validatePasswordStrength } from "@/server/security/password";
import { getMessagingProvider } from "@/server/ai/registry";
import { buildUserPasswordEmail } from "@/core/platform/welcome-email";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";

/** Un lien d'accueil ou de réinitialisation reste valable une semaine. */
const PASSWORD_LINK_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export async function issueUserPasswordLink(userId: string): Promise<{ url: string; expiresAt: Date }> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + PASSWORD_LINK_TTL_MS);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: expiresAt },
  });
  return { url: publicUrl(`/mot-de-passe/${token}`), expiresAt };
}

/**
 * Envoie au titulaire (ou à tout utilisateur d'officine) le lien pour définir
 * son mot de passe. `welcome` à la création du compte, `reset` sur demande.
 * Renvoie l'issue réelle du prestataire : un envoi non configuré est dit
 * SIMULATED, jamais présenté comme réussi.
 */
export async function sendUserPasswordLink(
  userId: string,
  kind: "welcome" | "reset",
): Promise<{ status: string; detail: string; url: string }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      memberships: { where: { isActive: true }, take: 1, select: { pharmacy: { select: { name: true } } } },
    },
  });
  const { url, expiresAt } = await issueUserPasswordLink(user.id);
  const message = buildUserPasswordEmail({
    firstName: user.firstName,
    pharmacyName: user.memberships[0]?.pharmacy.name ?? null,
    url,
    loginUrl: publicUrl("/login"),
    expiresAt,
    kind,
  });
  const outcome = await getMessagingProvider().sendEmail({
    to: user.email,
    fromName: "PharmaBoost",
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  await recordAudit({
    action: "auth.password_link_sent",
    entityType: "User",
    entityId: user.id,
    userId: user.id,
    metadata: { kind, status: outcome.status, provider: outcome.provider },
  });
  return { status: outcome.status, detail: outcome.detail, url };
}

export async function peekUserPasswordToken(token: string): Promise<{ userId: string; email: string; firstName: string } | null> {
  if (!token || token.length < 16) return null;
  const user = await prisma.user.findUnique({ where: { passwordResetTokenHash: hashToken(token) } });
  if (!user || user.status !== "ACTIVE" || user.deletedAt || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    return null;
  }
  return { userId: user.id, email: user.email, firstName: user.firstName };
}

/** Définit le mot de passe depuis un lien : jeton consommé, sessions ouvertes fermées. */
export async function setUserPasswordByToken(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const found = await peekUserPasswordToken(token);
  if (!found) return { ok: false, error: "Ce lien n'est plus valide. Demandez-en un nouveau depuis la page de connexion." };
  const problems = validatePasswordStrength(password);
  if (problems.length > 0) return { ok: false, error: problems.join(" ") };

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: found.userId },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
    }),
    prisma.session.updateMany({ where: { userId: found.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await recordAudit({ action: "auth.password_set", entityType: "User", entityId: found.userId, userId: found.userId });
  return { ok: true };
}
