import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BellOff, BellRing } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { NOTIFICATION_SEVERITY, loadAdminNotifications, severityFromParam } from "@/server/services/admin/communications";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { FilterChips } from "@/components/admin/filters";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { TIME_ZONE } from "@/config/constants";
import { cn } from "@/lib/utils";
import { MarkReadButton } from "./mark-read-button";

export const metadata: Metadata = { title: "Notifications" };

const BASE = "/admin/notifications";
const SEVERITY_ORDER = ["CRITICAL", "WARNING", "SUCCESS", "INFO"] as const;

const dayKey = new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeLabel = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

const DOT: Record<string, string> = { CRITICAL: "bg-danger-500", WARNING: "bg-warning-500", SUCCESS: "bg-success-500", INFO: "bg-ink-300 dark:bg-ink-600" };

/**
 * Les alertes de la plateforme pour l'équipe : regroupées par jour, filtrables
 * par sévérité et par état de lecture ; chaque ligne mène au dossier concerné.
 */
export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
  const severity = severityFromParam(one(params.severite));
  const unreadOnly = one(params.lues) === "non";
  const { rows, severityCounts, unread, total, truncated } = await loadAdminNotifications({ severity, unreadOnly });

  const keep = { severite: severity ? NOTIFICATION_SEVERITY[severity].param : null, lues: unreadOnly ? "non" : null };
  const groups: { day: string; label: string; rows: typeof rows }[] = [];
  for (const row of rows) {
    const day = dayKey.format(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, label: dayLabel.format(row.createdAt), rows: [row] });
  }
  const filtered = Boolean(severity || unreadOnly);

  return (
    <>
      <AdminPageHeader
        space={{ label: "Communication", href: "/admin/communications" }}
        title="Notifications"
        description={unread ? `${unread} non lue${unread > 1 ? "s" : ""} sur ${total}. Les alertes de la plateforme pour l'équipe : contrats bloqués, impayés, relances dépassées…` : "Tout est lu. Les alertes de la plateforme pour l'équipe arrivent ici."}
        actions={
          <>
            {unread > 0 && <MarkReadButton />}
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/communications?type=notification">Dans l&apos;historique</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-card p-4">
        <FilterChips
          basePath={BASE}
          param="severite"
          label="Sévérité"
          current={keep.severite}
          keep={{ lues: keep.lues }}
          options={[
            { value: null, label: "Toutes", count: SEVERITY_ORDER.reduce((sum, s) => sum + (severityCounts[s] ?? 0), 0) },
            ...SEVERITY_ORDER.map((s) => ({ value: NOTIFICATION_SEVERITY[s].param, label: NOTIFICATION_SEVERITY[s].label, count: severityCounts[s] ?? 0 })),
          ]}
        />
        <FilterChips
          basePath={BASE}
          param="lues"
          label="État de lecture"
          current={keep.lues}
          keep={{ severite: keep.severite }}
          options={[
            { value: null, label: "Toutes" },
            { value: "non", label: "Non lues", count: unread },
          ]}
        />
      </div>

      <AdminSection padded={false}>
        {rows.length === 0 ? (
          <EmptyState
            icon={filtered ? <BellOff className="size-5" /> : <BellRing className="size-5" />}
            title={filtered ? "Aucune notification pour ces filtres" : "Rien à signaler pour l'instant"}
            description={filtered ? "Retirez un filtre pour voir les autres notifications." : "Les alertes de la plateforme (contrat bloqué, impayé, relance dépassée…) apparaîtront ici."}
            action={
              filtered ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={BASE}>Voir toutes les notifications</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-border-subtle">
            {groups.map((group) => (
              <section key={group.day} aria-label={group.label}>
                <h2 className="bg-surface-sunken/60 px-5 py-2 text-[12px] font-semibold tracking-[0.04em] text-text-tertiary uppercase first-letter:uppercase">{group.label}</h2>
                <ul className="divide-y divide-border-subtle">
                  {group.rows.map((n) => {
                    const sev = NOTIFICATION_SEVERITY[n.severity] ?? NOTIFICATION_SEVERITY.INFO;
                    return (
                      <li key={n.id} className={cn("flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-surface-sunken/50", n.readAt && "opacity-75")}>
                        <span className="flex w-14 shrink-0 items-center gap-2 pt-0.5">
                          <span className={cn("size-2 rounded-full", n.readAt ? "bg-transparent ring-1 ring-border-default" : DOT[n.severity] ?? DOT.INFO)} aria-label={n.readAt ? "Lue" : "Non lue"} />
                          <span className="text-[12px] text-text-tertiary tabular-nums">{timeLabel.format(n.createdAt)}</span>
                        </span>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="flex flex-wrap items-center gap-2 text-[14px] leading-5 font-medium text-text-primary">
                            {n.linkUrl ? (
                              <Link href={n.linkUrl} className="hover:underline">
                                {n.title}
                              </Link>
                            ) : (
                              n.title
                            )}
                            <StatusBadge status={sev} />
                          </p>
                          {n.body && <p className="text-[13px] leading-5 text-text-secondary">{n.body}</p>}
                        </div>
                        {n.linkUrl && (
                          <Button asChild variant="ghost" size="sm" className="shrink-0">
                            <Link href={n.linkUrl}>
                              Ouvrir
                              <ArrowUpRight className="size-4" aria-hidden="true" />
                            </Link>
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        {truncated && <p className="border-t border-border-subtle px-5 py-3 text-[12.5px] text-text-tertiary">Les {rows.length} notifications les plus récentes sont affichées. L&apos;historique complet est dans l&apos;historique des communications.</p>}
      </AdminSection>
    </>
  );
}
