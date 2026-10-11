"use client";

import { useState, useTransition, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, CreditCard, FileWarning, Info, LifeBuoy, MessageSquareReply, MonitorCheck, PackageCheck, PackageMinus, PackageX, ScanSearch, Sparkles, Users } from "lucide-react";
import { markReadAction } from "@/server/actions/notifications";
import { buildFeed, categoryOf, CATEGORY_LOOK, entryIds, toneOf, whenLabel, type FeedCategory, type FeedEntry, type FeedItem, type FeedTone } from "@/core/notifications/feed";
import { TIME_ZONE } from "@/config/constants";
import { cn } from "@/lib/utils";

/** Une notification telle qu'elle voyage du serveur à l'écran (la date en texte). */
export type FeedItemJson = Omit<FeedItem, "createdAt"> & { createdAt: string };

const ICONS: Record<FeedCategory, ComponentType<{ className?: string }>> = {
  stock: PackageMinus,
  rupture: PackageX,
  conseil: Sparkles,
  analyse: ScanSearch,
  document: FileWarning,
  import: PackageCheck,
  suivi: MessageSquareReply,
  equipe: Users,
  support: LifeBuoy,
  abonnement: CreditCard,
  comptoir: MonitorCheck,
  info: Info,
};

const TONES: Record<FeedTone, string> = {
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300",
  success: "bg-success-50 text-success-700 dark:bg-success-950/40 dark:text-success-400",
  warning: "bg-warning-50 text-warning-800 dark:bg-warning-950/40 dark:text-warning-400",
  danger: "bg-danger-50 text-danger-700 dark:bg-danger-950/40 dark:text-danger-400",
  info: "bg-info-50 text-info-700 dark:bg-info-950/40 dark:text-info-400",
  neutral: "bg-surface-sunken text-text-secondary",
};

/**
 * Le fil des notifications, le même dans la cloche (`compact`) et sur la page « Notifications » : par jour, une icône et une
 * couleur par sorte d'alerte, les alertes de stock du jour regroupées. Ouvrir une notification la marque lue pour soi
 * seulement, puis mène à l'écran concerné.
 */
export function NotificationFeed({ items, compact = false, onNavigate, now }: { items: FeedItemJson[]; compact?: boolean; onNavigate?: () => void; now?: string }) {
  // L'instant présent est figé au premier rendu : le fil ne change pas de section sous les yeux (et le rendu reste pur).
  const [reference] = useState(() => (now ? new Date(now) : new Date()));
  const sections = buildFeed(
    items.map((item) => ({ ...item, createdAt: new Date(item.createdAt) })),
    reference,
    TIME_ZONE,
  );
  return (
    <div className={cn(compact ? "space-y-3" : "space-y-6")}>
      {sections.map((section) => (
        <section key={section.bucket} aria-label={section.label}>
          <h3 className={cn("font-semibold tracking-[0.06em] text-text-tertiary uppercase", compact ? "px-3 pb-1 text-[10.5px]" : "pb-2 text-[11.5px]")}>{section.label}</h3>
          <ul className={cn(!compact && "divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-card")}>
            {section.entries.map((entry) => (
              <li key={entry.key}>
                <Entry entry={entry} compact={compact} onNavigate={onNavigate} now={reference} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Entry({ entry, compact, onNavigate, now }: { entry: FeedEntry; compact: boolean; onNavigate?: () => void; now: Date }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const sample = entry.kind === "single" ? entry.item : entry.items[0];
  const category = categoryOf(sample);
  const Icon = ICONS[category];
  const unread = entry.kind === "single" ? !entry.item.read : entry.unread > 0;
  const title = entry.kind === "single" ? entry.item.title : entry.title;
  const when = entry.kind === "single" ? entry.item.createdAt : entry.latest;
  const body = entry.kind === "single" ? entry.item.body : entry.summary;

  /** Ouvre une notification : lue pour soi, puis l'écran concerné. */
  const go = (ids: string[], link: string | null, wasUnread: boolean) => {
    startTransition(async () => {
      if (wasUnread) await markReadAction(ids).catch(() => undefined);
      onNavigate?.();
      if (link) router.push(link);
      else router.refresh();
    });
  };

  // Un groupe s'ouvre sur place : ses lignes deviennent lisibles, une par une ; l'ouvrir vaut lecture.
  const toggleGroup = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && unread) startTransition(async () => {
      await markReadAction(entryIds(entry)).catch(() => undefined);
      router.refresh();
    });
  };

  const row = (
    <>
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", TONES[toneOf(sample)])}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", unread ? "font-semibold text-text-primary" : "text-text-secondary")}>{title}</span>
        </span>
        <span className={cn("mt-0.5 block text-[12.5px] leading-[18px] text-text-secondary", compact && "line-clamp-2")}>{body}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-text-tertiary">
          <span>{CATEGORY_LOOK[category].label}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={when.toISOString()}>{whenLabel(when, now, TIME_ZONE)}</time>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-center gap-2 pt-1">
        <span className={cn("size-2 rounded-full", unread ? "bg-brand-500" : "bg-transparent")} aria-label={unread ? "Non lue" : undefined} />
        {entry.kind === "group" ? (
          <ChevronDown className={cn("size-4 text-text-tertiary transition-transform", expanded && "rotate-180")} aria-hidden="true" />
        ) : (
          entry.item.linkUrl && <ChevronRight className="size-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
        )}
      </span>
    </>
  );
  const rowClass = cn(
    "group flex w-full items-start gap-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 disabled:opacity-60",
    compact ? "rounded-lg px-3 py-2.5 hover:bg-surface-sunken" : "px-4 py-3.5 hover:bg-surface-sunken",
  );

  if (entry.kind === "single") {
    return (
      <button type="button" onClick={() => go([entry.item.id], entry.item.linkUrl, unread)} disabled={pending} className={rowClass}>
        {row}
      </button>
    );
  }

  return (
    <div>
      <button type="button" onClick={toggleGroup} aria-expanded={expanded} className={rowClass}>
        {row}
      </button>
      {expanded && (
        <ul className={cn("pb-2", compact ? "pl-14 pr-3" : "pl-[60px] pr-4")}>
          {entry.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => go([item.id], item.linkUrl, !item.read)}
                disabled={pending}
                className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] leading-[18px] text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">{item.body}</span>
                <time className="shrink-0 text-[11px] text-text-tertiary" dateTime={item.createdAt.toISOString()}>{whenLabel(item.createdAt, now, TIME_ZONE)}</time>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => go([], entry.linkUrl, false)} className="mt-1 px-2 py-1 text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-300">
              Tout voir
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
