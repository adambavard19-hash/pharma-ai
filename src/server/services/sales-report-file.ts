import "server-only";
import { prisma } from "@/server/db/client";
import { loadSalesReport } from "@/server/services/counter-history";
import { renderSalesReportPdf } from "@/core/counter/sales-report-pdf";
import { resolveReportRange, SALES_REPORT_PERIODS, type SalesReportPeriod } from "@/core/counter/sales-report";
import { TIME_ZONE } from "@/config/constants";

/** Le PDF du rapport de performance du comptoir d'UNE officine, et son nom de fichier. Généré à la volée, jamais stocké. */
export async function salesReportPdfFile(pharmacyId: string, period: SalesReportPeriod | { param: string }, now: Date = new Date(), options: { /** Un membre de l'équipe : seulement SES ventes, son nom au titre. */ onlyFor?: { userId: string; postIds: string[] }; person?: string } = {}): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { name: true } });
  if (!pharmacy) return null;
  // Une période de la console (« 2026-10-16 », « mois-en-cours »…) ou une des trois périodes historiques.
  const range = resolveReportRange(typeof period === "string" ? (SALES_REPORT_PERIODS.find((entry) => entry.key === period)?.param ?? "semaine") : period.param, now, TIME_ZONE);
  const report = await loadSalesReport({ pharmacyId, range, now, onlyFor: options.onlyFor });
  const bytes = await renderSalesReportPdf({ pharmacyName: options.person ? `${pharmacy.name} · ${options.person}` : pharmacy.name, report, generatedAt: now, timeZone: TIME_ZONE });
  const day = new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE }).format(now);
  const slug = pharmacy.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const label = range.param;
  return { bytes, fileName: `pharmaboost-performance-${slug}-${label}-${day}.pdf` };
}

export function pdfResponseHeaders(fileName: string): HeadersInit {
  return { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
}
