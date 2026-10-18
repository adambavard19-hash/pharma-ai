import { LGO_DEFINITIONS } from "@/core/stock/connectors";
import "server-only";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/server/security/password";
import { getMessagingProvider } from "@/server/ai/registry";
import { buildUserPasswordEmail } from "@/core/platform/welcome-email";
import { publicUrl } from "@/server/public-url";
import { presentationVideoLinks } from "@/core/platform/presentation-video";
import { recordAudit } from "@/server/audit/log";
import { recordDispatch } from "@/server/services/email-dispatch";
import type { MessagingProvider } from "@/core/ai/ports";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";

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
  deps?: { messaging?: MessagingProvider },
): Promise<{ status: string; detail: string; url: string }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      memberships: { where: { isActive: true }, take: 1, select: { role: true, pharmacy: { select: { id: true, name: true, isDemo: true } } } },
    },
  });
  const { url, expiresAt } = await issueUserPasswordLink(user.id);
  // L'e-mail de création de l'espace reste court (fondateur, 18 oct. 2026) : l'installation des postes arrive dans un SECOND e-mail, au
  // titulaire (services/platform-onboarding.ts, sendInstallationGuide) — celui-ci le lui annonce.
  const onboarding = null;
  const installGuideFollows = kind === "welcome" && user.memberships[0]?.role === "OWNER";
  const message = buildUserPasswordEmail({
    firstName: user.firstName,
    pharmacyName: user.memberships[0]?.pharmacy.name ?? null,
    url,
    loginUrl: publicUrl("/login"),
    expiresAt,
    kind,
    onboarding,
    installGuideFollows,
    video: kind === "welcome" ? presentationVideoLinks(publicUrl) : null,
  });
  const messaging = deps?.messaging ?? getMessagingProvider({ demo: user.memberships[0]?.pharmacy.isDemo === true });
  const outcome = await messaging
    .sendEmail({ to: user.email, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html })
    .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
  await recordDispatch({ kind: kind === "welcome" ? "WELCOME" : "ACCESS_LINK", recipient: user.email, outcome, userId: user.id, pharmacyId: user.memberships[0]?.pharmacy.id ?? null });
  // Le titulaire reçoit, juste après l'e-mail de création de son espace, le second : installer PharmaBoost sur chaque poste (une seule
  // fois par pharmacie, d'où qu'elle ait été créée : console, directeur commercial, extranet des commerciaux).
  const ownerPharmacyId = installGuideFollows && outcome.status !== "FAILED" ? (user.memberships[0]?.pharmacy.id ?? null) : null;
  if (ownerPharmacyId && !user.memberships[0]?.pharmacy.isDemo) {
    await import("@/server/services/platform-onboarding")
      .then(({ sendInstallationGuide }) => sendInstallationGuide(ownerPharmacyId, { reason: "OWNER_CREATED" }))
      .catch((error: unknown) => console.error("[accueil] guide d'installation non envoyé", error));
  }
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

export type OwnPasswordChange =
  | { ok: true }
  | { ok: false; field: "currentPassword" | "newPassword"; error: string };

/**
 * Changer SON mot de passe, depuis une session ouverte (comptoir « Mon compte » ou PharmaBoost Mobile « Mon espace ») :
 * l'ancien mot de passe est exigé, les autres sessions sont fermées, la courante conservée. Les deux écrans appellent
 * cette même fonction ; seule la façon d'obtenir la session diffère.
 */
export async function changeOwnPassword(identity: { userId: string; sessionId: string; pharmacyId: string | null }, currentPassword: string, newPassword: string): Promise<OwnPasswordChange> {
  const user = await prisma.user.findUnique({ where: { id: identity.userId }, select: { passwordHash: true } });
  if (!(await verifyPassword(currentPassword, user?.passwordHash))) return { ok: false, field: "currentPassword", error: "Mot de passe actuel incorrect." };

  const weaknesses = validatePasswordStrength(newPassword);
  if (weaknesses.length > 0) return { ok: false, field: "newPassword", error: `Mot de passe trop faible : ${weaknesses.join(", ")}.` };

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: identity.userId }, data: { passwordHash } });
    await tx.session.updateMany({ where: { userId: identity.userId, revokedAt: null, id: { not: identity.sessionId } }, data: { revokedAt: new Date() } });
  });
  await recordAudit({ action: "auth.password_changed", entityType: "User", entityId: identity.userId, pharmacyId: identity.pharmacyId, userId: identity.userId });
  return { ok: true };
}
