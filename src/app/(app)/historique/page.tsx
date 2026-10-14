import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadClosedSales } from "@/server/services/counter-history";
import { buildSalesReport, euros, periodFromParam, reportWindow, SALES_REPORT_PERIODS, toSalesReportView, type SalesReportPeriod } from "@/core/counter/sales-report";
import { TIME_ZONE } from "@/config/constants";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { CounterSalesReport } from "@/components/performance/counter-sales-report";

export const metadata: Metadata = { title: "Historique des ventes" };

const PAGE_SIZE = 50;

/**
 * L'historique : CHAQUE vente terminée au comptoir (« Vente terminée » au poste), la plus récente d'abord — l'heure, qui l'a
 * faite, les boîtes scannées, les conseils proposés, vendus ou non, le chiffre d'affaires qu'ils ont ajouté, le bilan e-mail.
 * Réservé au titulaire (même permission que les performances). L'officine vient de la session, jamais de l'adresse.
 */
export default async function HistoriquePage({ searchParams }: { searchParams: Promise<{ periode?: string | string[]; page?: string | string[] }> }) {
  const session = await requirePermission(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
  const query = await searchParams;
  const period = periodFromParam(query.periode);
  const pageNumber = Math.max(1, Math.min(200, Number(Array.isArray(query.page) ? query.page[0] : query.page) || 1));
  const now = new Date();
  const { from, to } = reportWindow(period, now, TIME_ZONE);
  const sales = await loadClosedSales({ pharmacyId: session.scope.pharmacyId, from, to });
  const report = buildSalesReport({ period, sales, now, timeZone: TIME_ZONE });
  const shown = sales.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(sales.length / PAGE_SIZE));
  const param = (key: SalesReportPeriod) => SALES_REPORT_PERIODS.find((entry) => entry.key === key)?.param ?? "semaine";
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <PageHeader title="Historique" description="Toutes les ventes terminées au comptoir, une par une : les boîtes scannées, les conseils proposés et vendus, et ce qu'ils ont rapporté." />

      <CounterSalesReport
        report={toSalesReportView(report)}
        hrefs={Object.fromEntries(SALES_REPORT_PERIODS.map((entry) => [entry.key, `/historique?periode=${entry.param}`])) as Record<SalesReportPeriod, string>}
        pdfHref={`/api/performance/comptoir-pdf?periode=${param(period)}`}
      />

      <Card>
        {sales.length === 0 ? (
          <EmptyState title="Aucune vente terminée sur la période" description="Chaque « Vente terminée » au poste du comptoir apparaîtra ici, avec ses conseils." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="border-b border-border-subtle text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">
                <tr>
                  <th className="px-4 py-3">Fin de la vente</th>
                  <th className="px-4 py-3">Par</th>
                  <th className="px-4 py-3">Boîtes scannées</th>
                  <th className="px-4 py-3">Conseils</th>
                  <th className="px-4 py-3">Vendus</th>
                  <th className="px-4 py-3 text-right">CA ajouté</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {shown.map((sale) => {
                  const revenue = sale.soldItems.reduce((sum, item) => sum + item.priceCents, 0);
                  return (
                    <tr key={sale.id} className="align-top hover:bg-surface-sunken/50">
                      <td className="px-4 py-3 whitespace-nowrap text-text-secondary">{time.format(sale.closedAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-text-primary">{sale.who}</td>
                      <td className="max-w-[260px] px-4 py-3 text-text-primary">
                        <Link href={`/vente/${sale.id}`} className="hover:underline">
                          {sale.boxes.length ? sale.boxes.join(" · ") : "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                        {sale.proposed} proposé{sale.proposed > 1 ? "s" : ""}
                        {sale.notSold > 0 && <span className="block text-[12px]">{sale.notSold} non vendu{sale.notSold > 1 ? "s" : ""}</span>}
                      </td>
                      <td className="max-w-[280px] px-4 py-3">
                        {sale.soldItems.length === 0 ? (
                          <span className="text-text-tertiary">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {sale.soldItems.map((item, index) => (
                              <Badge key={`${item.name}-${index}`} tone="success">
                                {item.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {sale.emailSent && (
                          <span className="mt-1 flex items-center gap-1 text-[11.5px] text-text-tertiary">
                            <Mail className="size-3" aria-hidden="true" /> Bilan envoyé au patient
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-text-primary tabular-nums">{revenue > 0 ? euros(revenue) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3 text-[13px]">
            <span className="text-text-secondary">
              {sales.length} ventes · page {pageNumber}/{pages}
            </span>
            <span className="flex gap-2">
              {pageNumber > 1 && <Link href={`/historique?periode=${param(period)}&page=${pageNumber - 1}`} className="font-medium text-brand-700 hover:underline">Précédentes</Link>}
              {pageNumber < pages && <Link href={`/historique?periode=${param(period)}&page=${pageNumber + 1}`} className="font-medium text-brand-700 hover:underline">Suivantes</Link>}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
