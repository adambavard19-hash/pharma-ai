import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { listNotifications } from "@/server/services/notifications";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { formatDateTime, formatRelative } from "@/lib/format";
import { MarkAllReadButton } from "./mark-all-read";

export const metadata: Metadata = { title: "Notifications" };

const TYPE_LABELS: Record<string, string> = {
  LOW_STOCK: "Stock faible",
  OUT_OF_STOCK: "Produit épuisé",
  RECOMMENDATION_PENDING: "Conseils à valider",
  ANALYSIS_FAILED: "Analyse impossible",
  DOCUMENT_NOT_DELIVERED: "Document non transmis",
  IMPORT_COMPLETED: "Import terminé",
  IMPORT_FAILED: "Import en échec",
  TEAM_EVENT: "Équipe",
  SYSTEM: "Système",
};

const SEVERITY_TONES: Record<
  string,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  CRITICAL: "danger",
};

export default async function NotificationsPage() {
  const session = await requireSession();
  const notifications = await listNotifications(session.scope, 80);
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        description="Stocks, conseils en attente, imports et évènements importants de votre officine."
        actions={unreadCount > 0 ? <MarkAllReadButton count={unreadCount} /> : null}
      />

      {notifications.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bell className="size-5" />}
            title="Aucune notification"
            description="Les alertes de stock et les conseils en attente apparaîtront ici."
          />
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border-subtle">
              {notifications.map((notification) => {
                const body = (
                  <div className="flex gap-3.5 py-3.5">
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        notification.readAt ? "bg-transparent" : "bg-brand-500"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`text-[13.5px] ${
                            notification.readAt
                              ? "text-text-secondary"
                              : "font-semibold text-text-primary"
                          }`}
                        >
                          {notification.title}
                        </p>
                        <Badge tone={SEVERITY_TONES[notification.severity] ?? "neutral"}>
                          {TYPE_LABELS[notification.type] ?? notification.type}
                        </Badge>
                      </div>
                      <p className="text-[12.5px] leading-5 text-text-secondary">
                        {notification.body}
                      </p>
                      <p className="text-[11.5px] text-text-tertiary">
                        {formatRelative(notification.createdAt)} ·{" "}
                        {formatDateTime(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                );

                return (
                  <li key={notification.id}>
                    {notification.linkUrl ? (
                      <Link
                        href={notification.linkUrl}
                        className="-mx-2 block rounded-lg px-2 transition-colors hover:bg-surface-sunken"
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
