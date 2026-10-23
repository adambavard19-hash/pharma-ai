import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadPerformanceReport, loadSubscriptionReturn } from "@/server/services/performance";
import { parsePeriodParams } from "@/core/performance/periods";
import { TIME_ZONE } from "@/config/constants";
import { PerformanceTabs } from "../pilotage/performance-tabs";
import { PageHeader } from "@/components/ui/page";
import { PerformanceDashboard } from "@/components/performance/performance-dashboard";
import { CounterResultsCard } from "@/components/performance/counter-results-card";
import { loadCounterResults } from "@/server/services/counter-results";
import { loadAdviceRows, loadSalesReport } from "@/server/services/counter-history";
import { ADVICE_FILTERS, PharmacyReport, type AdviceFilter } from "@/components/admin/performance/pharmacy-report";
import { CounterSalesReport } from "@/components/performance/counter-sales-report";
import { periodFromParam, reportWindow, SALES_REPORT_PERIODS, toSalesReportView, type SalesReportPeriod } from "@/core/counter/sales-report";

export const metadata: Metadata = { title: "Performances — ce que PharmaBoost rapporte" };

/**
 * « Ce que PharmaBoost vous rapporte » : la valeur mesurée des conseils, pour le titulaire.
 *
 * Même permission que Pilotage : un chiffre d'affaires attribué est une vue de titulaire,
 * l'équipe au comptoir ne le voit pas (403 sans la permission, et l'entrée de menu n'existe pas
 * pour elle). Pas de `loading.tsx` : il placerait la page dans une frontière Suspense, et un refus
 * deviendrait un 200 portant l'écran « Accès réservé » au lieu du vrai 403 (comme Pilotage).
 * L'officine vient TOUJOURS de la session, jamais de l'adresse ; l'adresse ne porte que la période. La période est lue par l'unique parseur du cœur, qui ne lève jamais d'erreur :
 * une valeur inconnue ou hostile retombe sur « 7 derniers jours ».
 *
 * `now` est lu une seule fois : la période, les deux lectures et l'affichage partagent le même
 * instant, sinon « aujourd'hui » et « le mois en cours » pourraient se décaler d'une lecture à l'autre.
 */
export default async function ResultatsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string | string[]; du?: string | string[]; au?: string | string[]; comptoir?: string | string[]; statut?: string | string[]; qui?: string | string[] }>;
}) {
  const session = await requirePermission(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
  const now = new Date();
  const query = await searchParams;
  const period = parsePeriodParams(query, now, TIME_ZONE);
  const counterPeriod = periodFromParam(query.comptoir);
  const { pharmacyId } = session.scope;

  // L'officine de démonstration commerciale lit sa propre activité marquée démo ; une vraie officine, jamais.
  const demo = session.scope.isDemo ? { pharmacyIsDemo: true } : {};

  const counterWindow = reportWindow(counterPeriod, now, TIME_ZONE);
  const [sales, adviceRows, report, roi, counter] = await Promise.all([
    loadSalesReport({ pharmacyId, period: counterPeriod, now }),
    loadAdviceRows({ pharmacyId, from: counterWindow.from, to: counterWindow.to }),
    loadPerformanceReport({ pharmacyId, period, now, ...demo }),
    loadSubscriptionReturn({ pharmacyId, now, ...demo }),
    loadCounterResults({ pharmacyId, since: period.start, until: period.end }),
  ]);

  // Les conseils du comptoir, par collaborateur : un clic sur une personne montre tous ses conseils vendus, à l'écran.
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const counterParam = SALES_REPORT_PERIODS.find((entry) => entry.key === counterPeriod)?.param ?? "semaine";
  const filter: AdviceFilter = ADVICE_FILTERS.some((entry) => entry.value === one(query.statut)) ? (one(query.statut) as AdviceFilter) : "tous";
  const person = adviceRows.some((row) => row.who === one(query.qui)) ? one(query.qui) : null;
  const adviceHref = (params: Record<string, string>) => `/resultats?${new URLSearchParams({ comptoir: counterParam, ...params }).toString()}#par-collaborateur`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performances"
        description="Les conseils proposés à votre équipe, ceux qu'elle a retenus, et les ventes confirmées qui en découlent. Ces chiffres sont réservés au titulaire de l'officine et à l'équipe PharmaBoost qui vous accompagne."
      />
      <PerformanceTabs active="rapporte" />

      <CounterSalesReport
        report={toSalesReportView(sales)}
        hrefs={Object.fromEntries(SALES_REPORT_PERIODS.map((entry) => [entry.key, `/resultats?comptoir=${entry.param}`])) as Record<SalesReportPeriod, string>}
        pdfHref={`/api/performance/comptoir-pdf?periode=${SALES_REPORT_PERIODS.find((entry) => entry.key === counterPeriod)?.param ?? "semaine"}`}
      />

      <PharmacyReport
        report={sales}
        rows={adviceRows}
        filter={filter}
        filterHref={(next) => adviceHref({ ...(next === "tous" ? {} : { statut: next }), ...(person ? { qui: person } : {}) })}
        person={person}
        personHref={(who) => adviceHref(who ? { qui: who, statut: "vendus" } : {})}
        figures={false}
        updatedAt={now}
      />

      <PerformanceDashboard report={report} roi={roi} basePath="/resultats" audience="owner" now={now} />

      <CounterResultsCard results={counter} periodLabel={period.label} />
    </div>
  );
}
