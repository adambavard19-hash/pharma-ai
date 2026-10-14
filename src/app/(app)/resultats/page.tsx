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
import { loadSalesReport } from "@/server/services/counter-history";
import { CounterSalesReport } from "@/components/performance/counter-sales-report";
import { periodFromParam, SALES_REPORT_PERIODS, toSalesReportView, type SalesReportPeriod } from "@/core/counter/sales-report";

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
  searchParams: Promise<{ periode?: string | string[]; du?: string | string[]; au?: string | string[]; comptoir?: string | string[] }>;
}) {
  const session = await requirePermission(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
  const now = new Date();
  const query = await searchParams;
  const period = parsePeriodParams(query, now, TIME_ZONE);
  const counterPeriod = periodFromParam(query.comptoir);
  const { pharmacyId } = session.scope;

  // L'officine de démonstration commerciale lit sa propre activité marquée démo ; une vraie officine, jamais.
  const demo = session.scope.isDemo ? { pharmacyIsDemo: true } : {};

  const [sales, report, roi, counter] = await Promise.all([
    loadSalesReport({ pharmacyId, period: counterPeriod, now }),
    loadPerformanceReport({ pharmacyId, period, now, ...demo }),
    loadSubscriptionReturn({ pharmacyId, now, ...demo }),
    loadCounterResults({ pharmacyId, since: period.start, until: period.end }),
  ]);

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

      <PerformanceDashboard report={report} roi={roi} basePath="/resultats" audience="owner" now={now} />

      <CounterResultsCard results={counter} periodLabel={period.label} />
    </div>
  );
}
