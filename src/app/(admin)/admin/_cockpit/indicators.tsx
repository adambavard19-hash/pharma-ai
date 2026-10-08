import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BadgeCheck, Hourglass, Percent, Store, TrendingUp, UserMinus, UserPlus } from "lucide-react";
import { AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { FilterChips, PERIODS } from "@/components/admin/filters";
import { BarChart, LineChart } from "@/components/admin/charts";
import { formatEuros } from "@/core/billing/subscription";
import { formatRate } from "@/core/admin/metrics";
import type { CockpitKpis, CockpitSeries } from "@/server/services/admin/cockpit";
import { COCKPIT_LINKS } from "./links";

const ICON = "size-4";

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

function SectionTitle({ id, title, description, action }: { id: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-[15px] leading-6 font-semibold text-text-primary">
          {title}
        </h2>
        <p className="text-[13px] leading-5 text-text-secondary">{description}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Les chiffres qui comptent, en une ligne : ce que rapporte le parc, combien d'officines, combien d'essais en cours,
 * combien d'abonnements à jour. Pas de tuile pour un chiffre sans intérêt : les paiements en retard et les contrats bloqués
 * sont dans « À traiter » dès qu'ils existent.
 */
export function FleetKpis({ kpis }: { kpis: CockpitKpis }) {
  const figures: { label: string; value: ReactNode; hint: string; href: string; icon: ReactNode; strong?: boolean }[] = [
    {
      label: "Revenu mensuel récurrent",
      value: formatEuros(kpis.mrrCents),
      hint: kpis.mrrCatalogFallback > 0 ? `tarifs contractuels · ${kpis.mrrCatalogFallback} au tarif catalogue` : "tarifs contractuels",
      href: COCKPIT_LINKS.mrr,
      icon: <TrendingUp className={ICON} />,
      strong: true,
    },
    { label: "Officines clientes", value: kpis.activePharmacies, hint: "actives, hors démonstration", href: COCKPIT_LINKS.activePharmacies, icon: <Store className={ICON} /> },
    { label: "Essais en cours", value: kpis.trials, hint: kpis.trialsEnding > 0 ? `dont ${kpis.trialsEnding} finissant sous 7 jours` : "aucun ne finit sous 7 jours", href: COCKPIT_LINKS.trials, icon: <Hourglass className={ICON} /> },
    { label: "Abonnements actifs", value: kpis.activeSubscriptions, hint: "payants, à jour", href: COCKPIT_LINKS.activeSubscriptions, icon: <BadgeCheck className={ICON} /> },
  ];
  return (
    <section aria-labelledby="cockpit-parc" className="space-y-3">
      <h2 id="cockpit-parc" className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-text-primary">
        Le parc en chiffres
      </h2>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border-subtle ring-1 ring-border-subtle lg:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label} className="bg-surface-card">
            <Link href={figure.href} className="group block h-full px-5 py-4 transition-colors hover:bg-surface-sunken/60 focus-visible:bg-surface-sunken/60 focus-visible:outline-none">
              <dt className="flex items-center gap-1.5 text-[12.5px] leading-5 font-medium text-text-secondary">
                <span className="text-text-tertiary" aria-hidden="true">
                  {figure.icon}
                </span>
                {figure.label}
              </dt>
              <dd className={cn("mt-1.5 leading-9 font-semibold tracking-[-0.02em] tabular-nums", figure.strong ? "text-[30px] text-brand-800 dark:text-brand-200" : "text-[28px] text-text-primary")}>{figure.value}</dd>
              <dd className="mt-0.5 text-[12px] leading-4 text-text-tertiary">{figure.hint}</dd>
            </Link>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Y a-t-il quelque chose à tracer ? Sans paiement ni abonnement, les courbes seraient trois lignes plates. */
export function hasTrend(series: CockpitSeries): boolean {
  return [series.mrr, series.newSubscriptions, series.cancellations].some((points) => points.some((point) => point.value > 0));
}

/** Ce qui s'est passé sur la période choisie : flux, conversion et courbes. */
export function PeriodBlock({ period, kpis, series }: { period: { value: string; label: string }; kpis: CockpitKpis; series: CockpitSeries }) {
  const step = series.granularity === "week" ? "par semaine" : "par mois";
  const end = series.granularity === "week" ? "chaque fin de semaine" : "chaque fin de mois";
  const { conversion } = kpis;
  return (
    <section aria-labelledby="cockpit-periode" className="space-y-3">
      <SectionTitle
        id="cockpit-periode"
        title="Sur la période"
        description={`${period.label} glissants, aujourd'hui compris · graphiques ${step}.`}
        action={<FilterChips basePath="/admin" param="periode" label="Période" current={period.value} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <KpiTile label="Nouveaux abonnements" value={kpis.newSubscriptions} hint={`créés sur ${period.label}`} href={COCKPIT_LINKS.newSubscriptions(period.value)} icon={<UserPlus className={ICON} />} />
          <KpiTile label="Résiliations" value={kpis.cancellations} hint="une fois par officine" href={COCKPIT_LINKS.cancellations(period.value)} tone={kpis.cancellations > 0 ? "warning" : "default"} icon={<UserMinus className={ICON} />} />
          <KpiTile
            label="Conversion essai → abonnement"
            value={formatRate(conversion.rate)}
            hint={conversion.ended > 0 ? `${conversion.converted} sur ${plural(conversion.ended, "essai terminé", "essais terminés")}` : "aucun essai terminé sur la période"}
            href="/admin/abonnements?filtre=actifs"
            icon={<Percent className={ICON} />}
          />
        </div>
        <AdminSection title="Évolution du MRR" description={`Valeur à ${end}.`} className="min-w-0 lg:col-span-2">
          <LineChart title="Évolution du MRR" points={series.mrr} format={formatEuros} emptyText="Aucun abonnement payé sur la période : la courbe apparaîtra au premier paiement encaissé." />
          <p className="mt-3 text-[12px] leading-5 text-text-tertiary">
            Reconstitué : à {end}, somme des tarifs contractuels des abonnements ouverts ayant déjà un paiement encaissé. Une résiliation sort le client dès qu&apos;elle est demandée.
          </p>
        </AdminSection>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <AdminSection title="Nouveaux abonnements" description={`Abonnements créés, ${step}.`} className="min-w-0">
          <BarChart title="Nouveaux abonnements" points={series.newSubscriptions} emptyText="Aucun nouvel abonnement sur la période." />
        </AdminSection>
        <AdminSection title="Résiliations" description={`Fins d'abonnement et demandes confirmées, une fois par officine, ${step}.`} className="min-w-0">
          <BarChart title="Résiliations" points={series.cancellations} tone="danger" emptyText="Aucune résiliation sur la période." />
        </AdminSection>
      </div>
    </section>
  );
}
