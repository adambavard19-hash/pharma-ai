import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadClosedSales } from "@/server/services/counter-history";
import { myComptoirs } from "@/server/services/comptoirs";
import { buildSalesReport, euros, parisMidnight, periodFromParam, reportWindow, SALES_REPORT_PERIODS, toSalesReportView, type SalesReportPeriod } from "@/core/counter/sales-report";
import { saleTitle } from "@/core/counter/sale-title";
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
 * Le titulaire voit toutes les ventes ; un membre de l'équipe, seulement les SIENNES (chaque comptoir est un espace à part).
 * L'officine vient de la session, jamais de l'adresse.
 */
type Query = { periode?: string | string[]; page?: string | string[]; jour?: string | string[]; de?: string | string[]; a?: string | string[]; numero?: string | string[] };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export default async function HistoriquePage({ searchParams }: { searchParams: Promise<Query> }) {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const everyone = session.permissions.has(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
  const onlyFor = everyone ? undefined : { userId: session.scope.userId, postIds: (await myComptoirs(session.scope)).postIds };
  const query = await searchParams;
  const period = periodFromParam(query.periode);
  const pageNumber = Math.max(1, Math.min(200, Number(one(query.page)) || 1));
  const now = new Date();
  // Les filtres pour retrouver une vente vite : un jour précis, une plage d'heures, un numéro de vente.
  const day = DAY.test(one(query.jour)) ? one(query.jour) : "";
  const fromTime = TIME.test(one(query.de)) ? one(query.de) : "";
  const toTime = TIME.test(one(query.a)) ? one(query.a) : "";
  const number = one(query.numero).replace(/\D/g, "").slice(0, 8);
  const filtered = Boolean(day || fromTime || toTime || number);
  const window = reportWindow(period, now, TIME_ZONE);
  const listFrom = day ? parisMidnight(new Date(`${day}T12:00:00Z`), TIME_ZONE) : number ? new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000) : window.from;
  const listTo = day ? new Date(listFrom.getTime() + 24 * 60 * 60 * 1000 - 1) : now;
  const [periodSales, listed] = await Promise.all([
    loadClosedSales({ pharmacyId: session.scope.pharmacyId, onlyFor, from: window.from, to: window.to }),
    filtered ? loadClosedSales({ pharmacyId: session.scope.pharmacyId, onlyFor, from: listFrom, to: listTo }) : Promise.resolve(null),
  ]);
  const report = buildSalesReport({ period, sales: periodSales, now, timeZone: TIME_ZONE });
  const clock = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const sales = (listed ?? periodSales).filter((sale) => {
    const at = clock.format(sale.closedAt);
    if (fromTime && at < fromTime) return false;
    if (toTime && at > toTime) return false;
    if (number && (sale.reference ?? "").replace(/\D/g, "").replace(/^0+/, "") !== (number.replace(/^0+/, "") || "0")) return false;
    return true;
  });
  const shown = sales.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(sales.length / PAGE_SIZE));
  const keep = new URLSearchParams(Object.entries({ periode: one(query.periode), jour: day, de: fromTime, a: toTime, numero: number }).filter(([, value]) => value));
  const pageHref = (target: number) => `/historique?${new URLSearchParams([...keep.entries(), ["page", String(target)]]).toString()}`;
  const param = (key: SalesReportPeriod) => SALES_REPORT_PERIODS.find((entry) => entry.key === key)?.param ?? "semaine";
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <PageHeader title="Historique" description={everyone ? "Toutes les ventes terminées au comptoir, une par une : les boîtes scannées, les conseils proposés et vendus, et ce qu'ils ont rapporté." : "Vos ventes terminées au comptoir, une par une : les boîtes scannées, les conseils proposés et vendus, et ce qu'ils ont rapporté."} />

      <CounterSalesReport
        report={toSalesReportView(report)}
        hrefs={Object.fromEntries(SALES_REPORT_PERIODS.map((entry) => [entry.key, `/historique?periode=${entry.param}`])) as Record<SalesReportPeriod, string>}
        pdfHref={everyone ? `/api/performance/comptoir-pdf?periode=${param(period)}` : undefined}
      />

      <Card>
        <form method="get" action="/historique" className="flex flex-wrap items-end gap-3 border-b border-border-subtle px-4 py-3.5">
          {one(query.periode) && <input type="hidden" name="periode" value={one(query.periode)} />}
          <label className="flex flex-col gap-1 text-[12px] font-medium text-text-secondary">
            Jour
            <input type="date" name="jour" defaultValue={day} className="h-9 rounded-lg border border-border-default bg-surface-card px-2.5 text-[13px] text-text-primary" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-text-secondary">
            De
            <input type="time" name="de" defaultValue={fromTime} className="h-9 rounded-lg border border-border-default bg-surface-card px-2.5 text-[13px] text-text-primary" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-text-secondary">
            À
            <input type="time" name="a" defaultValue={toTime} className="h-9 rounded-lg border border-border-default bg-surface-card px-2.5 text-[13px] text-text-primary" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-text-secondary">
            N° de vente
            <input type="text" inputMode="numeric" name="numero" defaultValue={number} placeholder="ex. 12" className="h-9 w-28 rounded-lg border border-border-default bg-surface-card px-2.5 text-[13px] text-text-primary" />
          </label>
          <button type="submit" className="h-9 rounded-lg bg-brand-600 px-4 text-[13px] font-semibold text-white hover:bg-brand-700">Rechercher</button>
          {filtered && (
            <Link href={one(query.periode) ? `/historique?periode=${one(query.periode)}` : "/historique"} className="h-9 px-2 text-[13px] leading-9 font-medium text-brand-700 hover:underline">
              Effacer
            </Link>
          )}
          <span className="ml-auto self-center text-[12.5px] text-text-tertiary">
            {sales.length} vente{sales.length > 1 ? "s" : ""}
            {filtered ? " trouvée" + (sales.length > 1 ? "s" : "") : ""}
          </span>
        </form>
        {sales.length === 0 ? (
          <EmptyState title={filtered ? "Aucune vente ne correspond" : "Aucune vente terminée sur la période"} description={filtered ? "Changez le jour, la plage d'heures ou le numéro." : "Chaque « Vente terminée » au poste du comptoir apparaîtra ici, avec ses conseils."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="border-b border-border-subtle text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">
                <tr>
                  <th className="px-4 py-3">Vente</th>
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
                      <td className="px-4 py-3 font-semibold whitespace-nowrap text-text-primary">
                        <Link href={`/vente/${sale.id}`} className="hover:underline">
                          {saleTitle(sale.reference)}
                        </Link>
                      </td>
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
              {pageNumber > 1 && <Link href={pageHref(pageNumber - 1)} className="font-medium text-brand-700 hover:underline">Précédentes</Link>}
              {pageNumber < pages && <Link href={pageHref(pageNumber + 1)} className="font-medium text-brand-700 hover:underline">Suivantes</Link>}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
