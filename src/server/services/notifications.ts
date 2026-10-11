import "server-only";
import { prisma } from "@/server/db/client";
import type { NotificationSeverity, NotificationType, Prisma } from "@/generated/prisma";
import type { TenantScope } from "@/server/db/tenant";
import { pushForNotification } from "./push";

/**
 * LE point d'entrée de toute notification de l'équipe : chaque écran, service ou tâche qui veut prévenir l'officine passe par
 * ici (la cloche du logiciel la montre aussitôt). Juste après l'écriture, les téléphones de l'équipe sonnent (notifications
 * push de PharmaBoost Mobile, services/push.ts) — avec un texte neutre, sans jamais le titre libre de la notification.
 */
export async function createNotification(params: {
  pharmacyId: string;
  userId?: string | null;
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  body: string;
  linkUrl?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const created = await prisma.notification.create({
    data: {
      pharmacyId: params.pharmacyId,
      userId: params.userId ?? null,
      type: params.type,
      severity: params.severity ?? "INFO",
      title: params.title,
      body: params.body,
      linkUrl: params.linkUrl ?? null,
      metadata: (params.metadata ?? {}) as never,
    },
    select: { id: true, pharmacyId: true, userId: true, type: true, createdAt: true, linkUrl: true },
  });
  // Les téléphones de l'équipe (application iPhone), s'ils ont activé les notifications. Ne lève jamais.
  await pushForNotification(created);
}

/** Ce que la personne connectée voit : les notifications de son officine qui sont à elle ou à toute l'équipe. */
function visibleTo(scope: TenantScope): Prisma.NotificationWhereInput {
  return { pharmacyId: scope.pharmacyId, OR: [{ userId: null }, { userId: scope.userId }] };
}

/**
 * Non lue POUR CETTE PERSONNE : ni lue avant le « lu par personne » (`readAt`, ancien « lu pour tous »), ni lue par elle
 * depuis. Une notification d'équipe lue par un collègue reste non lue pour les autres.
 */
function unreadFor(scope: TenantScope): Prisma.NotificationWhereInput {
  return { ...visibleTo(scope), readAt: null, reads: { none: { userId: scope.userId } } };
}

export async function countUnreadNotifications(scope: TenantScope): Promise<number> {
  return prisma.notification.count({ where: unreadFor(scope) });
}

export type NotificationRow = { id: string; type: NotificationType; severity: NotificationSeverity; title: string; body: string; linkUrl: string | null; createdAt: Date; read: boolean };

export async function listNotifications(scope: TenantScope, limit = 50): Promise<NotificationRow[]> {
  const rows = await prisma.notification.findMany({
    where: visibleTo(scope),
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, severity: true, title: true, body: true, linkUrl: true, createdAt: true, readAt: true, reads: { where: { userId: scope.userId }, select: { userId: true } } },
  });
  return rows.map(({ readAt, reads, ...row }) => ({ ...row, read: readAt !== null || reads.length > 0 }));
}

/** Marque lues, pour cette personne seulement, des notifications qu'elle voit (les autres identifiants sont ignorés). */
export async function markNotificationsRead(scope: TenantScope, ids: string[]): Promise<number> {
  const unique = [...new Set(ids)].slice(0, 200);
  if (unique.length === 0) return 0;
  const mine = await prisma.notification.findMany({ where: { ...unreadFor(scope), id: { in: unique } }, select: { id: true } });
  if (mine.length === 0) return 0;
  const result = await prisma.notificationRead.createMany({ data: mine.map(({ id }) => ({ notificationId: id, userId: scope.userId })), skipDuplicates: true });
  return result.count;
}

export async function markAllNotificationsRead(scope: TenantScope): Promise<number> {
  const unread = await prisma.notification.findMany({ where: unreadFor(scope), select: { id: true } });
  if (unread.length === 0) return 0;
  const result = await prisma.notificationRead.createMany({ data: unread.map(({ id }) => ({ notificationId: id, userId: scope.userId })), skipDuplicates: true });
  return result.count;
}

/**
 * Reconstruit les alertes de stock. Appelée après un ajustement de stock ou un
 * import ; évite de créer un doublon pour un produit déjà signalé aujourd'hui.
 */
export async function refreshStockNotifications(pharmacyId: string): Promise<void> {
  const stockItems = await prisma.stockItem.findMany({
    where: { pharmacyId, product: { isActive: true, deletedAt: null } },
    include: { product: { select: { id: true, name: true } } },
  });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const alreadyNotified = await prisma.notification.findMany({
    where: {
      pharmacyId,
      type: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
      createdAt: { gte: startOfDay },
    },
    select: { metadata: true, type: true },
  });

  const notifiedKeys = new Set(
    alreadyNotified.map((n) => {
      const metadata = n.metadata as { productId?: string } | null;
      return `${n.type}:${metadata?.productId ?? ""}`;
    }),
  );

  for (const item of stockItems) {
    const isOut = item.quantity <= 0;
    const isLow = !isOut && item.quantity <= item.alertThreshold;
    if (!isOut && !isLow) continue;

    const type: NotificationType = isOut ? "OUT_OF_STOCK" : "LOW_STOCK";
    if (notifiedKeys.has(`${type}:${item.productId}`)) continue;

    await createNotification({
      pharmacyId,
      type,
      severity: isOut ? "CRITICAL" : "WARNING",
      title: isOut ? "Produit épuisé" : "Stock faible",
      body: isOut
        ? `${item.product.name} est en rupture. Il ne sera plus proposé en conseil.`
        : `${item.product.name} : ${item.quantity} unité(s) restante(s), seuil d'alerte à ${item.alertThreshold}.`,
      linkUrl: `/stock/${item.productId}`,
      metadata: { productId: item.productId, quantity: item.quantity },
    });
  }
}
