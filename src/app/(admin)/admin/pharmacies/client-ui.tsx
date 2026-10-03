import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { hrefWith } from "@/components/admin/filters";
import { formatDateTime, formatRelative } from "@/lib/format";
import { truncate } from "@/core/admin/clients";
import { cn } from "@/lib/utils";

/**
 * Petits éléments partagés par les pages de l'espace « Clients » (officines,
 * utilisateurs, activité, accès, état technique).
 */

/** Une date relative (« il y a 3 jours »), la date et l'heure exactes au survol. */
export function When({ date, empty = "—", className }: { date: Date | null | undefined; empty?: ReactNode; className?: string }) {
  if (!date) return <span className={cn("text-text-tertiary", className)}>{empty}</span>;
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)} className={className}>
      {formatRelative(date)}
    </time>
  );
}

/** Un message technique (erreur d'agent, d'export) : chasse fixe, tronqué, complet au survol. */
export function TechText({ text, max = 140 }: { text: string | null | undefined; max?: number }) {
  if (!text) return <span className="text-text-tertiary">—</span>;
  return (
    <code title={text.length > max ? text : undefined} className="block max-w-[28rem] rounded-md bg-surface-sunken px-2 py-1 font-mono text-[11.5px] leading-4 break-words whitespace-pre-wrap text-text-secondary">
      {truncate(text, max)}
    </code>
  );
}

/** Une ligne principale et sa précision dessous, pour les cellules de tableau. */
export function Stack({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <>
      <span className="block text-[13px] text-text-primary">{primary}</span>
      {secondary ? <span className="mt-0.5 block text-[12px] text-text-tertiary">{secondary}</span> : null}
    </>
  );
}

/** Pagination par l'adresse : précédent / suivant, les autres filtres conservés. */
export function Pagination({ basePath, keep, page, pages, total, unit }: { basePath: string; keep: Record<string, string | null | undefined>; page: number; pages: number; total: number; unit: [string, string] }) {
  if (pages <= 1) return <p className="text-[12.5px] text-text-tertiary">{total} {total > 1 ? unit[1] : unit[0]}</p>;
  const link = (target: number) => hrefWith(basePath, keep, { page: target > 1 ? String(target) : null });
  const button = "inline-flex h-8 items-center gap-1 rounded-lg border border-border-default bg-surface-card px-2.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-brand-300 hover:text-text-primary";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[12.5px] text-text-tertiary">
        {total} {total > 1 ? unit[1] : unit[0]} · page {page} sur {pages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={link(page - 1)} className={button}>
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Précédente
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={link(page + 1)} className={button}>
            Suivante
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
