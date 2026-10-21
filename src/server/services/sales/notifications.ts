import "server-only";
import { prisma } from "@/server/db/client";
import type { NotificationSeverity } from "@/generated/prisma";

/** Notifications de l'extranet : un commercial, ou tous les administrateurs. */
export async function notifySalesRep(params: { salesRepId: string; type: string; title: string; body: string; linkUrl?: string | null; severity?: NotificationSeverity }): Promise<void> {
  await prisma.extranetNotification.create({
    data: { audience: "SALES", salesRepId: params.salesRepId, type: params.type, title: params.title, body: params.body, linkUrl: params.linkUrl ?? null, severity: params.severity ?? "INFO" },
  });
}

type AdminEmail = { subject: string; text: string; html: string };

/** Ces notifications ne partent pas par e-mail : une panne d'envoi qui écrirait un e-mail tournerait en boucle. */
const NOT_EMAILED = new Set(["EMAIL_FAILED"]);

/**
 * Une notification à toute l'équipe : la cloche de la console, ET un e-mail à chaque administrateur actif (fondateur,
 * 21 oct. 2026 : « je veux recevoir les mails sur tout »). `email` remplace le message simple par un message détaillé ;
 * `alreadySentTo` évite le doublon à une adresse qui a déjà reçu l'alerte. L'e-mail ne fait jamais échouer l'appelant.
 */
export async function notifyAdmins(params: { type: string; title: string; body: string; linkUrl?: string | null; severity?: NotificationSeverity; email?: AdminEmail; alreadySentTo?: string[] }): Promise<void> {
  await prisma.extranetNotification.create({
    data: { audience: "ADMIN", type: params.type, title: params.title, body: params.body, linkUrl: params.linkUrl ?? null, severity: params.severity ?? "INFO" },
  });
  if (NOT_EMAILED.has(params.type)) return;
  await emailAdmins(params).catch((error) => console.error("[notifications] e-mail aux administrateurs impossible", params.type, error));
}

async function emailAdmins(params: { title: string; body: string; linkUrl?: string | null; email?: AdminEmail; alreadySentTo?: string[] }): Promise<void> {
  const admins = (await prisma.platformAdmin.findMany({ where: { isActive: true }, select: { email: true } })) ?? [];
  const skip = new Set((params.alreadySentTo ?? []).map((address) => address.toLowerCase()));
  const recipients = [...new Set(admins.map((admin) => admin.email.toLowerCase()))].filter((address) => !skip.has(address));
  if (recipients.length === 0) return;
  // Chargés à la demande : la cloche de la console n'embarque pas le prestataire d'e-mail.
  const [{ getMessagingProvider }, { publicUrl }, { traceDispatch }, { buildTeamNotificationEmail }] = await Promise.all([
    import("@/server/ai/registry"),
    import("@/server/public-url"),
    import("@/server/services/email-dispatch"),
    import("@/core/platform/site-emails"),
  ]);
  const message = params.email ?? buildTeamNotificationEmail({ title: params.title, body: params.body, url: params.linkUrl ? publicUrl(params.linkUrl) : null });
  const messaging = getMessagingProvider();
  for (const to of recipients) {
    const outcome = await messaging.sendEmail({ to, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html }).catch(() => null);
    if (outcome) await traceDispatch({ kind: "TEAM_ALERT", recipient: to, outcome, subject: message.subject, trigger: "SYSTEM" });
  }
}

export async function listSalesNotifications(salesRepId: string, limit = 30) {
  return prisma.extranetNotification.findMany({ where: { audience: "SALES", salesRepId }, orderBy: { createdAt: "desc" }, take: limit });
}

export async function countUnreadSalesNotifications(salesRepId: string): Promise<number> {
  return prisma.extranetNotification.count({ where: { audience: "SALES", salesRepId, readAt: null } });
}

export async function markSalesNotificationsRead(salesRepId: string): Promise<void> {
  await prisma.extranetNotification.updateMany({ where: { audience: "SALES", salesRepId, readAt: null }, data: { readAt: new Date() } });
}

export async function listAdminNotifications(limit = 30) {
  return prisma.extranetNotification.findMany({ where: { audience: "ADMIN" }, orderBy: { createdAt: "desc" }, take: limit });
}

export async function countUnreadAdminNotifications(): Promise<number> {
  return prisma.extranetNotification.count({ where: { audience: "ADMIN", readAt: null } });
}

export async function markAdminNotificationsRead(): Promise<void> {
  await prisma.extranetNotification.updateMany({ where: { audience: "ADMIN", readAt: null }, data: { readAt: new Date() } });
}

/** Les derniers formulaires remplis sur le site (démonstration, recommandation, candidature, partenariat, abonnement…). */
export async function listRecentFormSubmissions(limit = 8) {
  const { FORM_NOTIFICATION_TYPES } = await import("@/core/admin/form-submissions");
  return prisma.extranetNotification.findMany({
    where: { audience: "ADMIN", type: { in: [...FORM_NOTIFICATION_TYPES] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, title: true, body: true, linkUrl: true, readAt: true, createdAt: true },
  });
}
