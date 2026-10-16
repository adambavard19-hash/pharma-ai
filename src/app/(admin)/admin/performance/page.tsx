import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check, Download, Euro, FileText, Percent, Sparkles } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadPharmaciesPerformance } from "@/server/services/pharmacies-performance";
import { euros, percent, RANGE_CHIPS, resolveReportRange } from "@/core/counter/sales-report";
import { TIME_ZONE } from "@/config/constants";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { PeriodPicker } from "@/components/admin/performance/period-picker";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Performance des pharmacies" };

const BASE_PATH = "/admin/performance";

/**
 * La performance de chaque pharmacie, sur la période choisie (fondateur, 16 oct. 2026 : « simple, on comprend tout
 * directement ») : les quatre chiffres de toutes les pharmacies réunies, puis une ligne par pharmacie — conseils
 * proposés, vendus, taux de vente, chiffre d'affaires ajouté. Un clic ouvre son rapport (liste des conseils, PDF).
 * Source : les ventes terminées au comptoir. Les pharmacies de démonstration ne sont pas comptées. Rafraîchi chaque minute.
 */
export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const now = new Date();
  const range = resolveReportRange(params.periode, now, TIME_ZONE);

  // Les pharmacies actives d'abord (le plus de chiffre d'affaires ajouté), celles sans vente ensuite.
  const reports = await loadPharmaciesPerformance(range, now);
  const total = reports.reduce((sum, { report }) => ({ sales: sum.sales + report.sales, proposed: sum.proposed + report.proposed, sold: sum.sold + report.sold, revenue: sum.revenue + report.revenueCents }), { sales: 0, proposed: 0, sold: 0, revenue: 0 });
  const today = new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE }).format(now);
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(now);
  const href = (periode: string) => `${BASE_PATH}?periode=${encodeURIComponent(periode)}`;

  const figures = [
    { label: "Conseils proposés", value: String(total.proposed), hint: `dans ${total.sales} vente${total.sales > 1 ? "s" : ""} terminée${total.sales > 1 ? "s" : ""}`, icon: <Sparkles className="size-4" /> },
    { label: "Conseils vendus", value: String(total.sold), hint: `sur ${total.proposed} proposé${total.proposed > 1 ? "s" : ""}`, icon: <Check className="size-4" />, success: true },
    { label: "Taux de vente", value: percent(total.proposed > 0 ? total.sold / total.proposed : null), hint: "conseils vendus ÷ conseils proposés", icon: <Percent className="size-4" /> },
    { label: "Chiffre d'affaires ajouté", value: euros(total.revenue), hint: "TTC, toutes pharmacies", icon: <Euro className="size-4" />, success: true },
  ];

  return (
    <>
      <AutoRefresh intervalMs={60_000} />
      <AdminPageHeader space={{ label: "Officines", href: "/admin/pharmacies" }} title="Performance" description={`Ce que PharmaBoost rapporte à chaque pharmacie · ${range.label}. Mis à jour à ${time}, toutes les minutes.`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker current={range.param} today={today} hrefFor={{ base: BASE_PATH, ...Object.fromEntries(RANGE_CHIPS.map((chip) => [chip.param, href(chip.param)])) }} />
        <a
          href={`/api/admin/performance/pdf?periode=${encodeURIComponent(range.param)}`}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-[13.5px] font-semibold text-white hover:bg-brand-700"
          data-pdf-toutes=""
        >
          <Download className="size-4" aria-hidden="true" />
          Télécharger le PDF · {range.label}
        </a>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-totaux="">
        {figures.map((figure) => (
          <div key={figure.label} className="rounded-2xl bg-surface-card p-5 ring-1 ring-border-subtle">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-text-secondary">{figure.label}</p>
              <span className="grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">{figure.icon}</span>
            </div>
            <p className={cn("mt-3 text-[34px] leading-10 font-bold tracking-[-0.03em] tabular-nums", figure.success ? "text-success-700 dark:text-success-400" : "text-text-primary")}>{figure.value}</p>
            <p className="mt-1 text-[12.5px] text-text-tertiary">{figure.hint}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl bg-surface-card ring-1 ring-border-subtle" aria-labelledby="pharmacies-perf">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 id="pharmacies-perf" className="text-[15px] font-semibold text-text-primary">Chaque pharmacie · {range.label}</h2>
          <p className="text-[12.5px] text-text-tertiary">Cliquez sur une pharmacie pour voir ses conseils un par un ; l&apos;icône PDF télécharge son rapport de la période.</p>
        </div>
        {reports.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-text-tertiary">Aucune pharmacie cliente pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13.5px]" data-tableau-pharmacies="">
              <thead>
                <tr className="text-left text-[12px] font-semibold tracking-wide text-text-tertiary uppercase">
                  <th className="px-5 py-3">Pharmacie</th>
                  <th className="px-3 py-3 text-right">Ventes</th>
                  <th className="px-3 py-3 text-right">Proposés</th>
                  <th className="px-3 py-3 text-right">Vendus</th>
                  <th className="px-3 py-3">Taux de vente</th>
                  <th className="px-3 py-3 text-right">CA ajouté</th>
                  <th className="px-5 py-3 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {reports.map(({ id, name, city, report }) => {
                  const rate = report.proposed > 0 ? report.sold / report.proposed : null;
                  const link = `/admin/pharmacies/${id}?onglet=performance&periode=${encodeURIComponent(range.param)}`;
                  return (
                    <tr key={id} className="group hover:bg-surface-sunken/60">
                      <td className="px-5 py-3">
                        <Link href={link} className="flex items-center gap-1.5 font-semibold text-text-primary group-hover:text-brand-700 dark:group-hover:text-brand-400">
                          {name}
                          <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                        </Link>
                        {city && <span className="text-[12px] text-text-tertiary">{city}</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-text-secondary tabular-nums">{report.sales}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{report.proposed}</td>
                      <td className="px-3 py-3 text-right font-semibold text-success-700 tabular-nums dark:text-success-400">{report.sold}</td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken">
                            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.round((rate ?? 0) * 100)}%` }} />
                          </span>
                          <span className="tabular-nums text-text-secondary">{percent(rate)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-text-primary tabular-nums">{euros(report.revenueCents)}</td>
                      <td className="px-5 py-3 text-right">
                        <a
                          href={`/api/admin/pharmacies/${id}/comptoir-pdf?periode=${encodeURIComponent(range.param)}`}
                          className="inline-grid size-8 place-items-center rounded-lg text-text-tertiary hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950 dark:hover:text-brand-300"
                          aria-label={`Télécharger le PDF de ${name}`}
                          title="Télécharger le PDF"
                        >
                          <FileText className="size-4" aria-hidden="true" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[12.5px] leading-5 text-text-tertiary">
        Compté sur les ventes terminées au comptoir. Un conseil est « vendu » quand il est bipé (ou déclaré vendu au comptoir) ; le chiffre d&apos;affaires est celui de ces conseils, au prix de vente TTC de la pharmacie. Les pharmacies de démonstration ne sont pas comptées.
      </p>
    </>
  );
}
