import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listAdminNotifications } from "@/server/services/sales/notifications";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { MarkReadButton } from "./mark-read-button";

export const metadata: Metadata = { title: "Notifications" };

const SEVERITY: Record<string, { tone: "neutral" | "success" | "warning" | "danger"; label: string }> = {
  INFO: { tone: "neutral", label: "Info" },
  SUCCESS: { tone: "success", label: "Fait" },
  WARNING: { tone: "warning", label: "À voir" },
  CRITICAL: { tone: "danger", label: "Urgent" },
};

/** Le centre de notifications de la console : chaque ligne mène au dossier concerné. */
export default async function AdminNotificationsPage() {
  await requirePlatformSession();
  const notifications = await listAdminNotifications(150);
  const unread = notifications.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Notifications" description={unread ? `${unread} non lue(s)` : "Tout est lu."} actions={unread ? <MarkReadButton /> : null} />
      <Card>
        <CardContent className="pt-0">
          {notifications.length === 0 ? (
            <p className="py-6 text-[13.5px] text-text-secondary">Rien à signaler.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {notifications.map((n) => {
                const sev = SEVERITY[n.severity] ?? SEVERITY.INFO;
                return (
                  <li key={n.id} className={"flex flex-wrap items-start gap-x-3 gap-y-1 py-3 " + (n.readAt ? "opacity-75" : "")}>
                    <span className="w-[130px] shrink-0 pt-0.5 text-[12px] tabular text-text-tertiary">{formatDateTime(n.createdAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-text-primary">
                        {!n.readAt && <span className="size-2 rounded-full bg-brand-600" aria-label="Non lue" />}
                        {n.linkUrl ? <Link href={n.linkUrl} className="hover:underline">{n.title}</Link> : n.title}
                        <Badge tone={sev.tone}>{sev.label}</Badge>
                      </p>
                      {n.body && <p className="mt-0.5 text-[13px] leading-5 text-text-secondary">{n.body}</p>}
                    </div>
                    {n.linkUrl && <Link href={n.linkUrl} className="text-[13px] font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Ouvrir le dossier</Link>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
