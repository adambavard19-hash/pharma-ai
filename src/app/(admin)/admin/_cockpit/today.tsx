import Link from "next/link";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDayShort, formatTime, type TodayItem, type TodayKind } from "@/core/admin/metrics";

const KIND: Record<TodayKind, { label: string; tone: "brand" | "info" | "warning" | "accent" | "neutral" }> = {
  demo: { label: "Démo", tone: "brand" },
  relance: { label: "Relance", tone: "info" },
  contrat: { label: "Contrat", tone: "warning" },
  essai: { label: "Fin d'essai", tone: "accent" },
  facture: { label: "Facture", tone: "neutral" },
};

/**
 * Ce qui tombe aujourd'hui, dans l'ordre de la journée : démonstrations, relances, fins d'essai, factures annoncées, et les
 * liens de signature qui expirent d'ici une semaine. Chaque ligne ouvre la fiche concernée. Une journée vide tient en une ligne.
 */
export function TodayBlock({ items, now }: { items: TodayItem[]; now: Date }) {
  return (
    <section aria-labelledby="cockpit-aujourdhui" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cockpit-aujourdhui" className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-text-primary">
          Aujourd&apos;hui
        </h2>
        {items.length > 0 && <p className="text-[12.5px] text-text-tertiary tabular-nums">{items.length} à voir</p>}
      </div>

      {items.length === 0 ? (
        <p className="flex items-center gap-2.5 rounded-2xl bg-surface-sunken/70 px-4 py-3.5 text-[13.5px] text-text-secondary">
          <CalendarCheck className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          Rien de prévu aujourd&apos;hui : ni démo, ni relance, ni fin d&apos;essai.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-card shadow-xs ring-1 ring-border-subtle xl:max-h-[560px] xl:overflow-y-auto">
          {items.map((item) => {
            const kind = KIND[item.kind];
            return (
              <li key={item.id}>
                <Link href={item.href} className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken/60 focus-visible:bg-surface-sunken/60 focus-visible:outline-none">
                  <span className="w-[68px] shrink-0 pt-0.5 text-[12.5px] leading-5 font-semibold text-text-primary tabular-nums">{item.precision === "time" ? formatTime(item.at) : formatDayShort(item.at, now)}</span>
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
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        <Link href="/admin/demonstrations?vue=aujourdhui" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
          Démonstrations du jour
        </Link>
        <Link href="/admin/relances-commerciales?vue=aujourdhui" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
          Relances du jour
        </Link>
      </p>
    </section>
  );
}
