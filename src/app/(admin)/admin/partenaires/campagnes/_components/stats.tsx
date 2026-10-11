import Link from "next/link";
import { BookOpenCheck, Eye, MousePointerClick, Percent, Send, View } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCtr, STAT_PERIODS, type StatPeriodKey, type StatTotals } from "@/core/sponsoring/stats";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Les chiffres d'une campagne ou d'un ensemble : agrégats seulement (aucune personne derrière un chiffre). */

export function PeriodChips({ basePath, current }: { basePath: string; current: StatPeriodKey }) {
  return (
    <nav aria-label="Période" className="flex flex-wrap gap-1.5">
      {STAT_PERIODS.map((period) => (
        <Link
          key={period.key}
          href={`${basePath}?periode=${period.key}`}
          aria-current={period.key === current ? "page" : undefined}
          className={cn("rounded-full border px-3 py-1 text-[12.5px] font-medium", period.key === current ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border-default text-text-secondary")}
        >
          {period.label}
        </Link>
      ))}
    </nav>
  );
}

export function StatTiles({ totals }: { totals: StatTotals }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Impressions" value={formatNumber(totals.impressions)} sublabel="vue ≥ 50 % pendant ≥ 1 s" icon={<Eye className="size-4" />} />
      <StatCard label="Clics" value={formatNumber(totals.clicks)} icon={<MousePointerClick className="size-4" />} />
      <StatCard label="Taux de clic" value={formatCtr(totals.ctr)} icon={<Percent className="size-4" />} emphasis="brand" />
      <StatCard label="Vues de détail" value={formatNumber(totals.views)} icon={<View className="size-4" />} />
      <StatCard label="Formations" value={`${formatNumber(totals.trainingsStarted)} / ${formatNumber(totals.trainingsCompleted)}`} sublabel="commencées / terminées" icon={<BookOpenCheck className="size-4" />} />
      <StatCard label="Demandes d'info" value={formatNumber(totals.infoRequests)} icon={<Send className="size-4" />} />
    </div>
  );
}

export function StatsTable({ rows, firstColumn, empty }: { rows: { key: string; label: string; totals: StatTotals }[]; firstColumn: string; empty: string }) {
  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-border-default px-4 py-5 text-[13px] text-text-tertiary">{empty}</p>;
  return (
    <TableWrapper>
      <Table>
        <THead>
          <TR>
            <TH>{firstColumn}</TH>
            <TH numeric>Impr.</TH>
            <TH numeric>Clics</TH>
            <TH numeric>Taux</TH>
            <TH numeric>Vues</TH>
            <TH numeric>Form.</TH>
            <TH numeric>Dem.</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.key}>
              <TD className="text-[13px] font-medium">{row.label}</TD>
              <TD numeric>{formatNumber(row.totals.impressions)}</TD>
              <TD numeric>{formatNumber(row.totals.clicks)}</TD>
              <TD numeric>{formatCtr(row.totals.ctr)}</TD>
              <TD numeric>{formatNumber(row.totals.views)}</TD>
              <TD numeric>
                {formatNumber(row.totals.trainingsStarted)}/{formatNumber(row.totals.trainingsCompleted)}
              </TD>
              <TD numeric>{formatNumber(row.totals.infoRequests)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrapper>
  );
}

/**
 * Impressions par jour : une seule série, une seule teinte (la marque), barres fines arrondies à l'extrémité,
 * infobulle au survol (et au focus), tableau détaillé juste en dessous.
 */
export function DailyImpressions({ days }: { days: { day: Date; totals: StatTotals }[] }) {
  if (days.length === 0) return <p className="rounded-xl border border-dashed border-border-default px-4 py-5 text-[13px] text-text-tertiary">Aucun chiffre sur la période.</p>;
  const max = Math.max(1, ...days.map((entry) => entry.totals.impressions));
  return (
    <figure className="space-y-2">
      <figcaption className="text-[13px] font-semibold text-text-primary">Impressions par jour</figcaption>
      <div className="flex h-40 items-end gap-[2px] border-b border-border-subtle pb-px" role="img" aria-label={`Impressions par jour, maximum ${formatNumber(max)}`}>
        {days.map((entry) => {
          const label = `${formatDate(entry.day)} : ${formatNumber(entry.totals.impressions)} impressions, ${formatNumber(entry.totals.clicks)} clics (${formatCtr(entry.totals.ctr)})`;
          return (
            <div key={entry.day.toISOString()} className="group relative flex h-full min-w-[6px] flex-1 items-end" tabIndex={0} aria-label={label}>
              <div className="w-full rounded-t-[4px] bg-brand-500 transition-colors group-hover:bg-brand-700 group-focus:bg-brand-700" style={{ height: `${Math.max(2, (entry.totals.impressions / max) * 100)}%` }} />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-ink-900 px-2 py-1 text-[11.5px] whitespace-nowrap text-white shadow group-hover:block group-focus:block">{label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[11.5px] text-text-tertiary">
        <span>{formatDate(days[0].day)}</span>
        <span>{formatDate(days[days.length - 1].day)}</span>
      </div>
    </figure>
  );
}
