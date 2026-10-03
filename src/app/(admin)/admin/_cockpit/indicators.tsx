import type { ReactNode } from "react";
import { AlertTriangle, BadgeCheck, FileClock, Hourglass, Percent, Store, TrendingUp, UserMinus, UserPlus } from "lucide-react";
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

/** Le parc à date : ces chiffres ne dépendent pas de la période choisie. */
export function FleetKpis({ kpis }: { kpis: CockpitKpis }) {
  const { contracts } = kpis;
  return (
    <section aria-labelledby="cockpit-parc" className="space-y-3">
      <SectionTitle id="cockpit-parc" title="Le parc aujourd'hui" description="Chiffres à date, hors démonstration. Chaque tuile ouvre sa liste." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Officines clientes" value={kpis.activePharmacies} hint="actives, hors démonstration" href={COCKPIT_LINKS.activePharmacies} icon={<Store className={ICON} />} />
        <KpiTile label="Essais en cours" value={kpis.trials} hint={kpis.trialsEnding > 0 ? `dont ${kpis.trialsEnding} finissant sous 7 jours` : "aucun ne finit sous 7 jours"} href={COCKPIT_LINKS.trials} icon={<Hourglass className={ICON} />} />
        <KpiTile label="Abonnements actifs" value={kpis.activeSubscriptions} hint="payants, à jour" href={COCKPIT_LINKS.activeSubscriptions} tone={kpis.activeSubscriptions > 0 ? "success" : "default"} icon={<BadgeCheck className={ICON} />} />
        <KpiTile
          label="MRR"
          value={formatEuros(kpis.mrrCents)}
          hint={kpis.mrrCatalogFallback > 0 ? `tarifs contractuels · ${kpis.mrrCatalogFallback} au tarif catalogue` : "tarifs contractuels"}
          href={COCKPIT_LINKS.mrr}
          tone="brand"
          icon={<TrendingUp className={ICON} />}
        />
        <KpiTile
          label="Contrats en attente"
          value={contracts.pending}
          hint={contracts.pending > 0 ? `${plural(contracts.drafts, "brouillon", "brouillons")} · ${contracts.toSign} à signer · ${contracts.toCountersign} à contresigner` : "aucun contrat en cours"}
          href={COCKPIT_LINKS.pendingContracts}
          icon={<FileClock className={ICON} />}
        />
        <KpiTile label="Paiements en retard" value={kpis.paymentsLate} hint="retards et impayés" href={COCKPIT_LINKS.paymentsLate} tone={kpis.paymentsLate > 0 ? "danger" : "default"} icon={<AlertTriangle className={ICON} />} />
      </div>
    </section>
  );
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
