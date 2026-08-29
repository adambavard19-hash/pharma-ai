import "server-only";
import { prisma } from "@/server/db/client";
import type { NotificationSeverity, NotificationType } from "@/generated/prisma";
import type { TenantScope } from "@/server/db/tenant";

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
  await prisma.notification.create({
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
  });
}

export async function countUnreadNotifications(scope: TenantScope): Promise<number> {
  return prisma.notification.count({
    where: {
      pharmacyId: scope.pharmacyId,
      readAt: null,
      OR: [{ userId: null }, { userId: scope.userId }],
    },
  });
}

export async function listNotifications(scope: TenantScope, limit = 50) {
  return prisma.notification.findMany({
    where: {
      pharmacyId: scope.pharmacyId,
      OR: [{ userId: null }, { userId: scope.userId }],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markAllNotificationsRead(scope: TenantScope): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      pharmacyId: scope.pharmacyId,
      readAt: null,
      OR: [{ userId: null }, { userId: scope.userId }],
    },
    data: { readAt: new Date() },
  });
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
