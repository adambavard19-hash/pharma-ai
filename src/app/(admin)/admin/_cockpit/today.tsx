import Link from "next/link";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { AdminSection } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { formatDayShort, formatTime, type TodayItem, type TodayKind } from "@/core/admin/metrics";

const KIND: Record<TodayKind, { label: string; tone: "brand" | "info" | "warning" | "accent" | "neutral" }> = {
  demo: { label: "Démo", tone: "brand" },
  relance: { label: "Relance", tone: "info" },
  contrat: { label: "Contrat", tone: "warning" },
  essai: { label: "Fin d'essai", tone: "accent" },
  facture: { label: "Facture", tone: "neutral" },
};

/**
 * Ce qui tombe aujourd'hui, dans l'ordre de la journée : démonstrations,
 * relances, fins d'essai, factures annoncées, et les liens de signature qui
 * expirent d'ici une semaine. Chaque ligne ouvre la fiche concernée.
 */
export function TodayBlock({ items, now }: { items: TodayItem[]; now: Date }) {
  return (
    <AdminSection
      title="Aujourd'hui"
      description="Démos, relances, fins d'essai, factures, liens de signature qui expirent."
      action={items.length > 0 ? <Badge tone="brand">{items.length}</Badge> : undefined}
      padded={false}
      className="min-w-0"
    >
      {items.length === 0 ? (
        <EmptyState className="py-10" icon={<CalendarCheck className="size-5" aria-hidden="true" />} title="Rien de prévu aujourd'hui" description="Les démonstrations, relances, fins d'essai et factures du jour s'afficheront ici, avec les liens de signature qui expirent dans la semaine." />
      ) : (
        <ul className="divide-y divide-border-subtle xl:max-h-[640px] xl:overflow-y-auto">
          {items.map((item) => {
            const kind = KIND[item.kind];
            return (
              <li key={item.id}>
                <Link href={item.href} className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken/70 focus-visible:bg-surface-sunken/70 focus-visible:outline-none">
                  <span className="w-[74px] shrink-0 pt-0.5 text-[12.5px] leading-5 font-semibold text-text-primary tabular-nums">
                    {item.precision === "time" ? formatTime(item.at) : formatDayShort(item.at, now)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={kind.tone}>{kind.label}</Badge>
                      {item.status && <Badge tone="success">{item.status}</Badge>}
                    </span>
                    <span className="mt-1 block truncate text-[13.5px] leading-5 font-medium text-text-primary">{item.title}</span>
                    {item.detail && <span className="block truncate text-[12.5px] leading-5 text-text-tertiary">{item.detail}</span>}
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border-subtle px-5 py-3 text-[12.5px]">
        <Link href="/admin/demonstrations?vue=aujourdhui" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
          Démonstrations du jour
        </Link>
        <Link href="/admin/relances-commerciales?vue=aujourdhui" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
          Relances du jour
        </Link>
      </div>
    </AdminSection>
  );
}
