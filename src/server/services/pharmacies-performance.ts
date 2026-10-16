import "server-only";
import { prisma } from "@/server/db/client";
import { loadSalesReport } from "@/server/services/counter-history";
import { renderPharmaciesReportPdf } from "@/core/counter/pharmacies-report-pdf";
import type { ReportRange, SalesReport } from "@/core/counter/sales-report";
import { isDemoMode } from "@/config/env";
import { TIME_ZONE } from "@/config/constants";

export type PharmacyPerformance = { id: string; name: string; city: string | null; report: SalesReport };

/**
 * Le rapport de chaque pharmacie active sur une période, le plus de chiffre d'affaires ajouté d'abord (celles sans vente
 * ensuite). Les pharmacies de démonstration ne sont pas lues hors environnement démo. La page Performance et son PDF.
 */
export async function loadPharmaciesPerformance(range: ReportRange, now: Date): Promise<PharmacyPerformance[]> {
  const pharmacies = await prisma.pharmacy.findMany({
    where: { isActive: true, ...(isDemoMode() ? {} : { isDemo: false }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true },
  });
  const reports = await Promise.all(pharmacies.map(async (pharmacy) => ({ ...pharmacy, report: await loadSalesReport({ pharmacyId: pharmacy.id, range, now }) })));
  return reports.sort((a, b) => b.report.revenueCents - a.report.revenueCents || b.report.sold - a.report.sold || b.report.sales - a.report.sales || a.name.localeCompare(b.name, "fr"));
}

/** Le PDF « toutes les pharmacies » de la période, et son nom de fichier. Généré à la volée, jamais stocké. */
export async function pharmaciesPerformancePdf(range: ReportRange, now: Date): Promise<{ bytes: Uint8Array; fileName: string }> {
  const rows = await loadPharmaciesPerformance(range, now);
  const bytes = await renderPharmaciesReportPdf({ label: range.label, from: range.from, to: range.to, rows, generatedAt: now, timeZone: TIME_ZONE });
  const day = new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE }).format(now);
  return { bytes, fileName: `pharmaboost-performance-pharmacies-${range.param}-${day}.pdf` };
}
