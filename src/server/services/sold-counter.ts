import { TIME_ZONE } from "@/config/constants";
import { buildSalesReport, euros, parisMidnight, percent, resolveReportRange, type ReportRange, type SalesReport } from "@/core/counter/sales-report";
import { loadClosedSales } from "@/server/services/counter-history";
import type { CounterPeriod } from "@/components/performance/sold-counter";

/**
 * Les quatre périodes du compteur de conseils vendus (aujourd'hui, cette semaine, ce mois-ci, cette année), lues en une
 * fois : les ventes de l'année, puis chaque période en est un filtre. `onlyFor` limite aux ventes d'un membre de l'équipe.
 */
export async function loadSoldCounter(input: { pharmacyId: string; now: Date; onlyFor?: { userId: string; postIds: string[] } }): Promise<{ periods: CounterPeriod[]; reports: SalesReport[] }> {
  const { now } = input;
  const yearStart = parisMidnight(new Date(Date.UTC(Number(new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric" }).format(now)), 0, 1, 12)), TIME_ZONE);
  const ranges: ReportRange[] = [
    resolveReportRange("jour", now, TIME_ZONE),
    resolveReportRange("semaine-en-cours", now, TIME_ZONE),
    resolveReportRange("mois-en-cours", now, TIME_ZONE),
    { param: "annee", label: "Cette année", from: yearStart, to: now, byHour: false },
  ];
  const sales = await loadClosedSales({ pharmacyId: input.pharmacyId, from: yearStart, to: now, onlyFor: input.onlyFor });
  const reports = ranges.map((range) =>
    buildSalesReport({ range, sales: sales.filter((sale) => sale.closedAt >= range.from && sale.closedAt <= range.to), now, timeZone: TIME_ZONE }),
  );
  const periods = reports.map((report, i) => ({
    key: ranges[i].param,
    label: ranges[i].label,
    sold: report.sold,
    revenue: euros(report.revenueCents),
    salesWithAdvice: `${report.withAdvice.toLocaleString("fr-FR")} sur ${report.sales.toLocaleString("fr-FR")} (${percent(report.attachRate)})`,
    sales: report.sales,
    share: report.attachRate,
  }));
  return { periods, reports };
}
