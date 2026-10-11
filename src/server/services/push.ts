import "server-only";
import { connect, type ClientHttp2Session } from "node:http2";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { APNS_HOSTS, APNS_TOKEN_TTL_MS, PUSH_QUIET_MS, apnsConfigFrom, apnsJwt, isDeadToken, isDeviceToken, pushPayload, pushUrlFor, type ApnsConfig, type PushKind } from "@/core/push/apns";
import type { NotificationType } from "@/generated/prisma";

/**
 * Les notifications push de PharmaBoost Mobile (application iPhone).
 *
 * Un téléphone s'enregistre quand la personne active les notifications dans « Mon espace ». Les notifications de l'équipe
 * (createNotification) et deux événements de l'application (prime validée, nouveau challenge) le font sonner — avec un texte
 * neutre, jamais une donnée patient ni un médicament (core/push/apns.ts). Sans clé APNs configurée, rien ne part et rien
 * ne casse : c'est l'état normal tant que la clé n'est pas donnée.
 */

let warned = false;
function config(): ApnsConfig | null {
  const found = apnsConfigFrom(getEnv());
  if (!found && !warned) {
    warned = true;
    console.info("[push] notifications push non configurées (APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY) : aucun envoi.");
  }
  return found;
}

export async function registerPushDevice(userId: string, token: string, environment: "production" | "development"): Promise<boolean> {
  if (!isDeviceToken(token)) return false;
  const now = new Date();
  // Un jeton appartient à une installation : si quelqu'un d'autre s'était connecté sur ce téléphone, le jeton change de main.
  await prisma.pushDevice.upsert({
    where: { token },
    create: { userId, token, environment, platform: "ios" },
    update: { userId, environment, lastSeenAt: now, disabledAt: null },
  });
  return true;
}

export async function unregisterPushDevice(userId: string, token: string): Promise<void> {
  await prisma.pushDevice.deleteMany({ where: { userId, token } });
}

/** Déconnexion de l'application, suppression du compte : plus aucun push pour cette personne. */
export async function removePushDevicesOf(userId: string): Promise<void> {
  await prisma.pushDevice.deleteMany({ where: { userId } });
}

let cachedJwt: { value: string; at: number } | null = null;
function jwt(apns: ApnsConfig, now: Date): string {
  if (!cachedJwt || now.getTime() - cachedJwt.at > APNS_TOKEN_TTL_MS) cachedJwt = { value: apnsJwt(apns, now), at: now.getTime() };
  return cachedJwt.value;
}

/** Un envoi à Apple, sur une connexion HTTP/2 déjà ouverte. */
function post(session: ClientHttp2Session, apns: ApnsConfig, token: string, payload: string, bearer: string): Promise<{ status: number; reason: string | null }> {
  return new Promise((resolve) => {
    const request = session.request({ ":method": "POST", ":path": `/3/device/${token}`, authorization: `bearer ${bearer}`, "apns-topic": apns.bundleId, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json" });
    let status = 0;
    let body = "";
    request.setTimeout(8000, () => request.close());
    request.on("response", (headers) => { status = Number(headers[":status"] ?? 0); });
    request.on("data", (chunk) => { body += String(chunk); });
    request.on("end", () => {
      let reason: string | null = null;
      try { reason = body ? (JSON.parse(body) as { reason?: string }).reason ?? null : null; } catch { /* corps illisible */ }
      resolve({ status, reason });
    });
    request.on("error", () => resolve({ status: 0, reason: "network" }));
    request.end(payload);
  });
}

/** Envoie un push à ces personnes (leurs téléphones actifs). Ne lève jamais : un push raté ne fait pas échouer le geste. */
export async function sendPushToUsers(userIds: string[], kind: PushKind, linkUrl?: string | null): Promise<{ sent: number; disabled: number }> {
  const result = { sent: 0, disabled: 0 };
  try {
    const apns = config();
    const unique = [...new Set(userIds)];
    if (!apns || unique.length === 0) return result;
    const payload = pushPayload(kind, pushUrlFor(linkUrl));
    if (!payload) return result;
    const devices = await prisma.pushDevice.findMany({ where: { userId: { in: unique }, disabledAt: null }, select: { id: true, token: true, environment: true } });
    if (devices.length === 0) return result;
    const now = new Date();
    const bearer = jwt(apns, now);
    for (const environment of ["production", "development"] as const) {
      const batch = devices.filter((device) => (device.environment === "development" ? "development" : "production") === environment);
      if (batch.length === 0) continue;
      const session = connect(APNS_HOSTS[environment]);
      session.on("error", () => undefined);
      try {
        for (const device of batch) {
          const answer = await post(session, apns, device.token, payload, bearer);
          if (answer.status === 200) result.sent += 1;
          else if (isDeadToken(answer.status, answer.reason)) {
            await prisma.pushDevice.update({ where: { id: device.id }, data: { disabledAt: now } });
            result.disabled += 1;
          }
        }
      } finally {
        session.close();
      }
    }
  } catch (error) {
    console.warn("[push] envoi impossible :", error instanceof Error ? error.message : error);
  }
  return result;
}

/**
 * Les destinataires d'une notification de l'équipe : la personne visée, ou toute l'équipe ACTIVE de cette officine — jamais
 * quelqu'un d'une autre officine. Une rafale (même sorte, même officine, moins de PUSH_QUIET_MS) ne sonne qu'une fois.
 */
export async function pushRecipientsFor(notification: { id: string; pharmacyId: string; userId: string | null; type: NotificationType; createdAt: Date }): Promise<string[]> {
  const recent = await prisma.notification.count({
    where: {
      pharmacyId: notification.pharmacyId,
      type: notification.type,
      id: { not: notification.id },
      createdAt: { gte: new Date(notification.createdAt.getTime() - PUSH_QUIET_MS), lte: notification.createdAt },
      ...(notification.userId ? { OR: [{ userId: null }, { userId: notification.userId }] } : {}),
    },
  });
  if (recent > 0) return [];
  const members = await prisma.membership.findMany({
    where: { pharmacyId: notification.pharmacyId, isActive: true, user: { deletedAt: null, status: "ACTIVE" }, ...(notification.userId ? { userId: notification.userId } : {}) },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

/** Après une notification de l'équipe : le push, si des téléphones l'attendent. Rien sans clé APNs (aucune requête). */
export async function pushForNotification(notification: { id: string; pharmacyId: string; userId: string | null; type: NotificationType; createdAt: Date; linkUrl: string | null }): Promise<void> {
  try {
    if (!config()) return;
    const recipients = await pushRecipientsFor(notification);
    if (recipients.length > 0) await sendPushToUsers(recipients, notification.type, notification.linkUrl);
  } catch (error) {
    console.warn("[push] notification non envoyée :", error instanceof Error ? error.message : error);
  }
}

/** Un nouveau challenge dans l'officine : toute l'équipe active (sauf qui l'a créé). */
export async function pushChallengeStarted(pharmacyId: string, exceptUserId: string): Promise<void> {
  try {
    if (!config()) return;
    const members = await prisma.membership.findMany({ where: { pharmacyId, isActive: true, userId: { not: exceptUserId }, user: { deletedAt: null, status: "ACTIVE" } }, select: { userId: true } });
    await sendPushToUsers(members.map((member) => member.userId), "CHALLENGE_STARTED", "/m/challenges");
  } catch (error) {
    console.warn("[push] challenge non annoncé :", error instanceof Error ? error.message : error);
  }
}
