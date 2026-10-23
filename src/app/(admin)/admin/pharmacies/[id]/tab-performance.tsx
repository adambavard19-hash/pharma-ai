import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/server/db/client";
import { Alert } from "@/components/ui/feedback";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { isDemoMode } from "@/config/env";
import { TIME_ZONE } from "@/config/constants";
import { loadAdviceRows, loadSalesReport } from "@/server/services/counter-history";
import { RANGE_CHIPS, resolveReportRange } from "@/core/counter/sales-report";
import { PeriodPicker } from "@/components/admin/performance/period-picker";
import { ADVICE_FILTERS, PharmacyReport, type AdviceFilter } from "@/components/admin/performance/pharmacy-report";

/**
 * La performance de cette officine, vue de la console (fondateur, 16 oct. 2026) : la période se choisit (aujourd'hui,
 * hier, cette semaine, ce mois-ci, 7 / 30 jours, un jour ou un mois précis), puis quatre chiffres, la liste des conseils
 * les collaborateurs (un clic : tous les conseils vendus de la personne) et le PDF de la même période. Tout passe par l'adresse (`?onglet=performance&periode=…&statut=…&qui=…`) et se rafraîchit
 * toutes les minutes. Les ventes terminées au comptoir et leurs conseils — aucune donnée patient.
 */
export async function PerformanceTab({ pharmacyId, query, now }: { pharmacyId: string; query: Record<string, string | string[] | undefined>; now: Date }) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { id: true, isDemo: true } });
  if (!pharmacy) notFound();
  const range = resolveReportRange(query.periode, now, TIME_ZONE);
  const rawFilter = Array.isArray(query.statut) ? query.statut[0] : query.statut;
  const filter: AdviceFilter = ADVICE_FILTERS.some((entry) => entry.value === rawFilter) ? (rawFilter as AdviceFilter) : "tous";
  const rawPerson = (Array.isArray(query.qui) ? query.qui[0] : query.qui)?.slice(0, 120) || null;
  const [report, rows] = await Promise.all([loadSalesReport({ pharmacyId, range, now }), loadAdviceRows({ pharmacyId, from: range.from, to: range.to })]);

  // Le collaborateur choisi n'est gardé que s'il a des conseils sur la période.
  const person = rawPerson && rows.some((row) => row.who === rawPerson) ? rawPerson : null;
  const base = `/admin/pharmacies/${pharmacy.id}?onglet=performance`;
  const href = (params: Record<string, string>) => `${base}${Object.entries(params).map(([key, value]) => `&${key}=${encodeURIComponent(value)}`).join("")}`;
  const today = new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE }).format(now);
  const demoExcluded = pharmacy.isDemo && !isDemoMode();

  return (
    <div className="space-y-5">
      <AutoRefresh intervalMs={60_000} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker current={range.param} today={today} hrefFor={{ base, ...Object.fromEntries(RANGE_CHIPS.map((chip) => [chip.param, href({ periode: chip.param })])) }} />
        <Link href={`/admin/performance?periode=${encodeURIComponent(range.param)}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Toutes les pharmacies
        </Link>
      </div>
      {demoExcluded ? (
        <Alert tone="info" title="Officine de démonstration : ses données ne sont pas comptées ici." />
      ) : (
        <PharmacyReport
          report={report}
          rows={rows}
          filter={filter}
          filterHref={(next) => href({ periode: range.param, ...(next === "tous" ? {} : { statut: next }), ...(person ? { qui: person } : {}) })}
          person={person}
          personHref={(who) => href({ periode: range.param, ...(who ? { qui: who, statut: "vendus" } : {}) })}
          pdfHref={`/api/admin/pharmacies/${pharmacy.id}/comptoir-pdf?periode=${encodeURIComponent(range.param)}`}
          updatedAt={now}
        />
      )}
    </div>
  );
}
