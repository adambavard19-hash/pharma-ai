import type { Metadata } from "next";
import { requireSession } from "@/server/auth/session";
import { listNotifications } from "@/server/services/notifications";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { NotificationFeed } from "@/components/app/notifications/notification-feed";
import { EmptyNotifications } from "./empty";
import { MarkAllReadButton } from "./mark-all-read";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const session = await requireSession();
  const notifications = await listNotifications(session.scope, 120);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        description="Stock, équipe, conseils et réponses du support : ce qui demande votre attention, jour par jour."
        actions={unreadCount > 0 ? <MarkAllReadButton count={unreadCount} /> : null}
      />

      {notifications.length === 0 ? (
        <Card>
          <EmptyNotifications />
        </Card>
      ) : (
        <NotificationFeed items={notifications.map((notification) => ({ ...notification, createdAt: notification.createdAt.toISOString() }))} />
      )}
    </div>
  );
}
