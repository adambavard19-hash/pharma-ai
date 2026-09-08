import type { Metadata } from "next";
import Link from "next/link";
import { requireSalesSession } from "@/server/auth/sales-session";
import { listSalesNotifications, markSalesNotificationsRead } from "@/server/services/sales/notifications";
import { Card, CardContent } from "@/components/ui/card";
import { Dot } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: { absolute: "Alertes — PharmaBoost" } };

export default async function SalesNotificationsPage() {
  const session = await requireSalesSession();
  const items = await listSalesNotifications(session.rep.id);
  // Lues dès l'affichage : la liste est courte et le badge du menu retombe.
  await markSalesNotificationsRead(session.rep.id);
  return (
    <>
      <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-text-primary">Alertes</h1>
      <Card><CardContent className="pt-0">
        {items.length === 0 ? <p className="py-6 text-[13.5px] text-text-secondary">Aucune alerte.</p> : (
          <ul className="divide-y divide-border-subtle">
            {items.map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-3">
                <Dot tone={n.severity === "SUCCESS" ? "success" : n.severity === "WARNING" ? "warning" : n.severity === "CRITICAL" ? "danger" : "brand"} className="mt-2" />
                <div className="min-w-0 flex-1">
                  <p className={"text-[14px] " + (n.readAt ? "text-text-primary" : "font-semibold text-text-primary")}>{n.linkUrl ? <Link href={n.linkUrl} className="hover:underline">{n.title}</Link> : n.title}</p>
                  {n.body && <p className="text-[13px] text-text-secondary">{n.body}</p>}
                  <p className="text-[12px] text-text-tertiary">{formatDateTime(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>
    </>
  );
}
