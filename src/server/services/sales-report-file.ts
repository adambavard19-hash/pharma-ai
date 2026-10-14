import "server-only";
import { prisma } from "@/server/db/client";
import { loadSalesReport } from "@/server/services/counter-history";
import { renderSalesReportPdf } from "@/core/counter/sales-report-pdf";
import { SALES_REPORT_PERIODS, type SalesReportPeriod } from "@/core/counter/sales-report";
import { TIME_ZONE } from "@/config/constants";

/** Le PDF du rapport de performance du comptoir d'UNE officine, et son nom de fichier. Généré à la volée, jamais stocké. */
export async function salesReportPdfFile(pharmacyId: string, period: SalesReportPeriod): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { name: true } });
  if (!pharmacy) return null;
  const now = new Date();
  const report = await loadSalesReport({ pharmacyId, period, now });
  const bytes = await renderSalesReportPdf({ pharmacyName: pharmacy.name, report, generatedAt: now, timeZone: TIME_ZONE });
  const day = new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE }).format(now);
  const slug = pharmacy.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const label = SALES_REPORT_PERIODS.find((entry) => entry.key === period)?.param ?? period;
  return { bytes, fileName: `pharmaboost-performance-${slug}-${label}-${day}.pdf` };
}

export function pdfResponseHeaders(fileName: string): HeadersInit {
  return { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
}
