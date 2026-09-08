import "server-only";
import { prisma } from "@/server/db/client";
import type { NotificationSeverity } from "@/generated/prisma";

/** Notifications de l'extranet : un commercial, ou tous les administrateurs. */
export async function notifySalesRep(params: { salesRepId: string; type: string; title: string; body: string; linkUrl?: string | null; severity?: NotificationSeverity }): Promise<void> {
  await prisma.extranetNotification.create({
    data: { audience: "SALES", salesRepId: params.salesRepId, type: params.type, title: params.title, body: params.body, linkUrl: params.linkUrl ?? null, severity: params.severity ?? "INFO" },
  });
}

export async function notifyAdmins(params: { type: string; title: string; body: string; linkUrl?: string | null; severity?: NotificationSeverity }): Promise<void> {
  await prisma.extranetNotification.create({
    data: { audience: "ADMIN", type: params.type, title: params.title, body: params.body, linkUrl: params.linkUrl ?? null, severity: params.severity ?? "INFO" },
  });
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
