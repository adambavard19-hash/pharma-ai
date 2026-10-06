import "server-only";
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/server/security/password";
import { rateLimited } from "@/server/http/rate-limit";
import { getMessagingProvider } from "@/server/ai/registry";
import { buildDirectorInvitationEmail } from "@/core/platform/sales-emails";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";

/**
 * L'accès du directeur commercial : connexion, lien « définir mon mot de
 * passe » (invitation ou oubli), choix du mot de passe.
 *
 * Aucun mot de passe n'est écrit nulle part, ni dans le journal ni dans un
 * message. Un lien est personnel, à usage unique, valable sept jours ; seule
 * son empreinte est conservée.
 */

const LINK_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const QUARTER_HOUR_MS = 1000 * 60 * 15;
const HOUR_MS = 1000 * 60 * 60;
const TEN_MINUTES_MS = 1000 * 60 * 10;

/**
 * Le travail qui n'a pas à retarder la réponse (écriture d'audit, envoi
 * d'e-mail) part APRÈS elle : un compte inconnu et un compte réel répondent
 * alors dans le même temps. Hors requête (tests, scripts), on l'attend.
 */
async function afterResponse(task: () => Promise<void>): Promise<void> {
  try {
    after(task);
  } catch {
    await task();
  }
}

/** Le même message pour un compte inconnu, un mot de passe faux et un compte désactivé. */
export const DIRECTOR_LOGIN_ERROR = "Identifiants incorrects.";
export const DIRECTOR_LOGIN_RATE_LIMITED = "Trop de tentatives. Patientez quelques minutes, puis réessayez.";
export const DIRECTOR_LINK_INVALID = "Ce lien n'est plus valide. Demandez-en un nouveau depuis la page de connexion.";

export type DirectorLoginResult = { ok: true; salesDirectorId: string } | { ok: false; error: string };

/**
 * Une empreinte factice, calculée une fois : un compte inconnu coûte autant de
 * temps qu'un mot de passe faux, et la durée de la réponse ne dit pas si
 * l'adresse existe.
 */
let decoyHash: Promise<string> | null = null;
const getDecoyHash = () => (decoyHash ??= hashPassword(randomBytes(32).toString("base64url")));

/**
 * Vérifie une connexion. La limitation de débit passe avant toute lecture et
 * avant le calcul d'empreinte (coûteux) : dix essais par quart d'heure pour un
 * même couple adresse + poste (un inconnu qui tape n'importe quoi sur l'adresse
 * du directeur ne le met pas dehors : il n'a pas SON poste), trente par poste,
 * et un plafond large par adresse seule contre une attaque répartie.
 * La session est ouverte par l'appelant.
 */
export async function authenticateDirector(email: string, password: string, meta: { ipAddress?: string | null } = {}): Promise<DirectorLoginResult> {
  const address = email.trim().toLowerCase();
  if (!address || !password) return { ok: false, error: DIRECTOR_LOGIN_ERROR };

  const ip = meta.ipAddress?.trim() || "inconnu";
  if (
    rateLimited(`director-login:${address}|${ip}`, 10, QUARTER_HOUR_MS) ||
    rateLimited(`director-login-ip:${ip}`, 30, QUARTER_HOUR_MS) ||
    rateLimited(`director-login-address:${address}`, 100, HOUR_MS)
  ) {
    return { ok: false, error: DIRECTOR_LOGIN_RATE_LIMITED };
  }

  const director = await prisma.salesDirector.findUnique({ where: { email: address }, select: { id: true, passwordHash: true, isActive: true } });
  const valid = await verifyPassword(password, director?.passwordHash ?? (await getDecoyHash()));
  if (!director || !valid || !director.isActive) {
    // Seul un compte réel est journalisé : jamais l'adresse saisie, que n'importe qui peut écrire.
    if (director) {
      const reason = valid ? "inactive" : "password";
      await afterResponse(async () => {
        await recordAudit({ action: "auth.login_failed", entityType: "SalesDirector", entityId: director.id, salesDirectorId: director.id, metadata: { scope: "director", reason } });
      });
    }
    return { ok: false, error: DIRECTOR_LOGIN_ERROR };
  }
  return { ok: true, salesDirectorId: director.id };
}

/**
 * Un nouveau lien pour définir le mot de passe : l'ancien cesse d'être valable.
 * Sert à l'invitation (console du Super Admin) comme à « mot de passe oublié ».
 */
export async function issueDirectorPasswordLink(salesDirectorId: string): Promise<{ url: string; expiresAt: Date }> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  await prisma.salesDirector.update({ where: { id: salesDirectorId }, data: { passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: expiresAt } });
  return { url: publicUrl(`/directeur/mot-de-passe/${token}`), expiresAt };
}

/**
 * « Mot de passe oublié ». La réponse ne dépend jamais de l'existence du
 * compte, ni dans son texte ni dans sa durée : le lien part (après la réponse)
 * si le compte existe et est actif, sinon rien ne part et rien ne se voit.
 * Trois demandes par couple adresse + poste et dix par poste, par heure.
 * Un lien émis il y a moins de dix minutes n'est PAS remplacé : sinon une simple
 * saisie de l'adresse invaliderait l'invitation qui vient d'être envoyée.
 */
export async function requestDirectorPasswordReset(email: string, meta: { ipAddress?: string | null } = {}): Promise<void> {
  const address = email.trim().toLowerCase();
  if (!address) return;
  const ip = meta.ipAddress?.trim() || "inconnu";
  if (rateLimited(`director-reset:${address}|${ip}`, 3, HOUR_MS) || rateLimited(`director-reset-ip:${ip}`, 10, HOUR_MS) || rateLimited(`director-reset-address:${address}`, 20, HOUR_MS)) return;

  const director = await prisma.salesDirector.findUnique({ where: { email: address }, select: { id: true, email: true, firstName: true, isActive: true, passwordResetExpiresAt: true } });
  if (!director?.isActive) return;
  const freshLink = director.passwordResetExpiresAt && director.passwordResetExpiresAt.getTime() > Date.now() + LINK_TTL_MS - TEN_MINUTES_MS;
  if (freshLink) return;
  await afterResponse(async () => {
    try {
      const { url, expiresAt } = await issueDirectorPasswordLink(director.id);
      const message = buildDirectorInvitationEmail({ firstName: director.firstName, url, expiresAt, kind: "reset" });
      const outcome = await getMessagingProvider().sendEmail({ to: director.email, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
      await recordAudit({ action: "auth.password_link_sent", entityType: "SalesDirector", entityId: director.id, salesDirectorId: director.id, metadata: { scope: "director", kind: "reset", status: outcome.status } });
    } catch (error) {
      // Ni l'adresse ni le lien dans le journal technique : seulement ce qui a échoué.
      console.error("[directeur] lien de mot de passe non envoyé", error instanceof Error ? error.message : "erreur inconnue");
    }
  });
}

/** Le compte derrière un lien encore valable, ou `null` (lien inconnu, périmé, déjà utilisé, compte désactivé). */
export async function peekDirectorPasswordToken(token: string): Promise<{ id: string; email: string; firstName: string } | null> {
  if (!token || token.length < 16) return null;
  const director = await prisma.salesDirector.findUnique({ where: { passwordResetTokenHash: hashToken(token) } });
  if (!director || !director.isActive || !director.passwordResetExpiresAt || director.passwordResetExpiresAt < new Date()) return null;
  return { id: director.id, email: director.email, firstName: director.firstName };
}

/**
 * Définit le mot de passe. Le lien est consommé dans la même opération que le
 * changement (deux envois simultanés : un seul passe) et toutes les sessions
 * ouvertes du compte sont révoquées.
 */
export async function setDirectorPasswordByToken(token: string, password: string): Promise<{ ok: true; salesDirectorId: string } | { ok: false; error: string }> {
  const found = await peekDirectorPasswordToken(token);
  if (!found) return { ok: false, error: DIRECTOR_LINK_INVALID };
  const problems = validatePasswordStrength(password);
  if (problems.length > 0) return { ok: false, error: `Mot de passe trop faible : ${problems.join(", ")}.` };

  const passwordHash = await hashPassword(password);
  const claimed = await prisma.$transaction(async (tx) => {
    const updated = await tx.salesDirector.updateMany({
      where: { id: found.id, passwordResetTokenHash: hashToken(token), isActive: true, passwordResetExpiresAt: { gt: new Date() } },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
    });
    if (updated.count !== 1) return false;
    await tx.salesDirectorSession.updateMany({ where: { salesDirectorId: found.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return true;
  });
  if (!claimed) return { ok: false, error: DIRECTOR_LINK_INVALID };
  await recordAudit({ action: "auth.password_set", entityType: "SalesDirector", entityId: found.id, salesDirectorId: found.id, metadata: { scope: "director" } });
  return { ok: true, salesDirectorId: found.id };
}
