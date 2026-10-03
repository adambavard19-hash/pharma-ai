import Link from "next/link";
import { Ban, Banknote, BellRing, Briefcase, CreditCard, FileSignature, KeyRound, Mail, ReceiptText, StickyNote, Wrench, FolderOpen } from "lucide-react";
import { groupTimelineByDay, TIMELINE_KIND_LABELS, type TimelineEntry, type TimelineKind } from "@/core/admin/timeline";
import { cn } from "@/lib/utils";
import { TIME_ZONE } from "@/config/constants";

const ICONS: Record<TimelineKind, typeof Mail> = {
  dossier: FolderOpen,
  contrat: FileSignature,
  abonnement: CreditCard,
  paiement: Banknote,
  email: Mail,
  note: StickyNote,
  resiliation: Ban,
  acces: KeyRound,
  technique: Wrench,
  tarif: ReceiptText,
  commercial: Briefcase,
};

const TONE_DOT = {
  neutral: "bg-ink-300 dark:bg-ink-600",
  info: "bg-info-500",
  brand: "bg-brand-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
} as const;

const time = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

/** La frise : regroupée par jour, une icône par nature de fait, l'auteur quand on le connaît. */
export function Timeline({ entries, emptyText = "Rien à afficher pour l'instant." }: { entries: TimelineEntry[]; emptyText?: string }) {
  if (entries.length === 0) return <p className="py-6 text-center text-[13.5px] text-text-tertiary">{emptyText}</p>;
  return (
    <ol className="space-y-6">
      {groupTimelineByDay(entries, TIME_ZONE).map((group) => (
        <li key={group.day}>
          <p className="mb-3 text-[12px] font-semibold tracking-[0.04em] text-text-tertiary uppercase first-letter:uppercase">{group.label}</p>
          <ol className="relative space-y-3 border-l border-border-subtle pl-6">
            {group.entries.map((entry) => {
              const Icon = ICONS[entry.kind];
              const content = (
                <>
                  <span className={cn("absolute top-1.5 -left-[29px] flex size-[22px] items-center justify-center rounded-full border-2 border-surface-card text-white", TONE_DOT[entry.tone ?? "neutral"])} aria-hidden="true">
                    <Icon className="size-3" />
                  </span>
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[12px] text-text-tertiary tabular-nums">{time.format(entry.at)}</span>
                    <span className="text-[11px] font-medium tracking-[0.03em] text-text-tertiary uppercase">{TIMELINE_KIND_LABELS[entry.kind]}</span>
                  </span>
                  <span className="mt-0.5 block text-[13.5px] leading-5 font-medium text-text-primary">{entry.title}</span>
                  {entry.detail && <span className="mt-0.5 block text-[12.5px] leading-5 break-words text-text-secondary">{entry.detail}</span>}
                  {entry.actor && <span className="mt-0.5 block text-[12px] text-text-tertiary">par {entry.actor}</span>}
                </>
              );
              return (
                <li key={entry.id} className="relative">
                  {entry.href ? (
                    <Link href={entry.href} className="block rounded-lg p-1 -m-1 hover:bg-surface-sunken">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
}

export function TimelineKindIcon({ kind, className }: { kind: TimelineKind; className?: string }) {
  const Icon = ICONS[kind] ?? BellRing;
  return <Icon className={className} aria-hidden="true" />;
}
