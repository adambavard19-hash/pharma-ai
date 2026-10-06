import { AlertTriangle, CheckCircle2, Euro, Info, Lightbulb, ShoppingBag, Sparkles, TrendingUp } from "lucide-react";
import type { DataQuality, Insight, PerformanceReport, SeriesBucket, SubscriptionReturn } from "@/core/performance/types";
import { SectionHeader } from "@/components/ui/page";
import { formatCents, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DeltaChip } from "./delta-chip";
import { EvolutionChart } from "./evolution-chart";
import { PerformanceEmptyState } from "./empty-state";
import { HonestFunnel } from "./honest-funnel";
import { metric } from "@/core/performance/metrics";
import { KpiCard } from "./kpi-card";
import { MethodPanel } from "./method-panel";
import { PeriodBar } from "./period-bar";
import { ProductsTable } from "./products-table";
import { RhythmHeatmap } from "./rhythm-heatmap";
import { SubscriptionReturnCard } from "./subscription-return-card";
import { UniverseBars } from "./universe-bars";
import { MIN_DECIDED_FOR_RATE, comparisonLabel, describeMetricDelta, describeRateDelta, formatRate } from "./format";

type Audience = "owner" | "platform";

/**
 * Les remarques sur la qualité des données, en clair : ce qui n'est PAS compté,
 * et pourquoi. Une ligne par sujet, seulement quand il y a quelque chose à dire.
 */
export function qualityNotes(quality: DataQuality): string[] {
  const notes: string[] = [];
  const { pendingAdvice: pending, unpricedConfirmedLines: unpriced, manualExcluded: manual, deletedPrescriptionAdvice: deleted } = quality;
  if (pending > 0) {
    notes.push(
      pending > 1
        ? `${formatNumber(pending)} conseils proposés depuis moins de 24 h attendent encore une décision : ils ne comptent pas encore dans le taux d'acceptation.`
        : "1 conseil proposé depuis moins de 24 h attend encore une décision : il ne compte pas encore dans le taux d'acceptation.",
    );
  }
  if (unpriced > 0) {
    notes.push(
      unpriced > 1
        ? `${formatNumber(unpriced)} lignes de vente issues d'un conseil n'ont pas de prix : aucun chiffre d'affaires n'est compté pour elles.`
        : "1 ligne de vente issue d'un conseil n'a pas de prix : aucun chiffre d'affaires n'est compté pour elle.",
    );
  }
  if (manual > 0) {
    notes.push(
      manual > 1
        ? `${formatNumber(manual)} produits ajoutés à la main par l'équipe ne sont pas comptés : ce ne sont pas des conseils PharmaBoost.`
        : "1 produit ajouté à la main par l'équipe n'est pas compté : ce n'est pas un conseil PharmaBoost.",
    );
  }
  if (deleted > 0) {
    notes.push(
      deleted > 1
        ? `${formatNumber(deleted)} conseils d'ordonnances supprimées sont ignorés.`
        : "1 conseil d'une ordonnance supprimée est ignoré.",
    );
  }
  return notes;
}

const INSIGHT_STYLES: Record<Insight["tone"], { icon: typeof TrendingUp; box: string; label: string | null }> = {
  positive: { icon: TrendingUp, box: "bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-500", label: null },
  neutral: { icon: Lightbulb, box: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300", label: null },
  attention: { icon: AlertTriangle, box: "bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500", label: "À surveiller : " },
};

/** Le bandeau-phrase : ce que PharmaBoost a fait, lisible en trois secondes, et le grand chiffre. */
function Hero({ report, comparison }: { report: PerformanceReport; comparison: string }) {
  const { narrative, revenue } = report;
  return (
    <section
      aria-labelledby="performance-headline"
      className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-surface-card to-surface-card p-5 shadow-xs sm:p-6 dark:border-brand-800/60 dark:from-brand-950 dark:via-surface-card dark:to-surface-card"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10">
        <div className="min-w-0 space-y-2">
          <h2 id="performance-headline" className="text-[22px] leading-8 font-semibold tracking-[-0.015em] text-text-primary sm:text-[26px] sm:leading-9">
            {narrative.headline}
          </h2>
          {narrative.revenueLine && <p className="max-w-2xl text-[14.5px] leading-6 text-text-secondary">{narrative.revenueLine}</p>}
        </div>
        <div className="space-y-1.5 border-t border-brand-100 pt-4 lg:min-w-60 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8 dark:border-brand-800/60">
          <p className="text-[12px] font-medium text-text-secondary">Chiffre d&apos;affaires attribué</p>
          <p data-figure="revenue" className="text-[40px] leading-[46px] font-semibold tracking-[-0.03em] text-brand-700 tabular dark:text-brand-300">
            {formatCents(revenue.confirmedTtcCents.value)}
          </p>
          <DeltaChip metric={revenue.confirmedTtcCents} comparison={comparison} />
          <p className="text-[12px] text-text-tertiary">TTC, ventes confirmées au prix saisi</p>
        </div>
      </div>
    </section>
  );
}

/** Une courbe n'a de sens qu'à partir de deux points. */
const sparkOf = (buckets: SeriesBucket[], pick: (bucket: SeriesBucket) => number) => (buckets.length >= 2 ? buckets.map(pick) : undefined);

/**
 * La variation du taux d'acceptation, en points : jamais sous 3 conseils
 * TRANCHÉS (proposés et pas en attente), ni cette période-ci ni la précédente.
 * Sur 1 ou 2 conseils, « +50 pts » ne dirait rien.
 */
export function rateDeltaText(funnel: PerformanceReport["funnel"]): string | null {
  const decided = funnel.proposed.value - funnel.pending;
  if (decided < MIN_DECIDED_FOR_RATE || funnel.proposed.previous < MIN_DECIDED_FOR_RATE) return null;
  const delta = describeRateDelta(funnel.acceptanceRate);
  return delta.tone === "up" || delta.tone === "down" ? delta.text : null;
}

function KpiRow({ report, comparison }: { report: PerformanceReport; comparison: string }) {
  const { funnel, revenue, series } = report;
  const rate = funnel.acceptanceRate.value;
  const rateDelta = rateDeltaText(funnel);
  const basket = revenue.averageBasketCents;
  const previousBasket = revenue.previousAverageBasketCents;

  const acceptedHint = rate === null ? "Taux d'acceptation : pas encore de conseil tranché" : `Taux d'acceptation ${formatRate(rate)}${rateDelta ? ` (${rateDelta})` : ""}`;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <KpiCard
        label="Conseils proposés"
        value={formatNumber(funnel.proposed.value)}
        hint={`${comparison}${funnel.pending > 0 ? ` · dont ${formatNumber(funnel.pending)} en attente` : ""}`}
        delta={describeMetricDelta(funnel.proposed)}
        spark={sparkOf(series.current, (bucket) => bucket.proposed)}
        icon={<Lightbulb className="size-4" aria-hidden="true" />}
      />
      <KpiCard
        label="Conseils acceptés"
        value={formatNumber(funnel.accepted.value)}
        hint={`${acceptedHint} · ${comparison}`}
        delta={describeMetricDelta(funnel.accepted)}
        spark={sparkOf(series.current, (bucket) => bucket.accepted)}
        icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
      />
      {/* Pas de mini-courbe : la courbe `purchased` trace des conseils distincts, pas des tickets de vente. */}
      <KpiCard
        label="Ventes confirmées"
        value={formatNumber(revenue.confirmedSales.value)}
        hint={comparison}
        delta={describeMetricDelta(revenue.confirmedSales)}
        icon={<ShoppingBag className="size-4" aria-hidden="true" />}
      />
      <KpiCard
        label="Panier moyen"
        value={basket === null ? "—" : formatCents(basket)}
        hint={`TTC, par vente confirmée · ${comparison}`}
        delta={basket !== null && previousBasket !== null ? describeMetricDelta(metric(basket, previousBasket)) : null}
        icon={<Euro className="size-4" aria-hidden="true" />}
      />
    </div>
  );
}

function Insights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <section aria-label="À retenir" className="space-y-3">
      <SectionHeader title="À retenir" description="Ce que ces chiffres disent, en quelques phrases." />
      <ul className="grid gap-3 md:grid-cols-2">
        {insights.map((insight) => {
          const style = INSIGHT_STYLES[insight.tone];
          const Icon = style.icon;
          return (
            <li key={`${insight.kind}-${insight.text}`} data-tone={insight.tone} className="flex gap-3 rounded-xl border border-border-subtle bg-surface-card p-4 shadow-xs">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", style.box)}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <p className="min-w-0 text-[13.5px] leading-6 text-text-primary">
                {style.label && <span className="sr-only">{style.label}</span>}
                {insight.text}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function QualityNotes({ quality, audience }: { quality: DataQuality; audience: Audience }) {
  const notes = qualityNotes(quality);
  return (
    <section aria-label="À savoir sur ces chiffres" className="space-y-2 rounded-xl border border-border-subtle bg-surface-sunken/60 px-4 py-3.5">
      <h3 className="text-[12.5px] font-semibold text-text-primary">À savoir sur ces chiffres</h3>
      <ul className="space-y-1.5">
        {notes.map((note) => (
          <li key={note} className="flex items-start gap-2 text-[12.5px] leading-5 text-text-secondary">
            <Info className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
            <span>{note}</span>
          </li>
        ))}
        <li className="flex items-start gap-2 text-[12.5px] leading-5 text-text-secondary">
          <Info className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span>
            Seules les ventes enregistrées dans PharmaBoost sont comptées, pas la caisse {audience === "owner" ? "de votre logiciel de gestion" : "du logiciel de gestion de l'officine"}.
          </span>
        </li>
      </ul>
    </section>
  );
}

/**
 * « Ce que PharmaBoost vous rapporte » : le tableau de bord complet, de la
 * phrase à la méthode. Même composant pour le titulaire et pour la console.
 * Il ne calcule rien : tout arrive dans `report`. La barre de période reste
 * visible même sans donnée, pour essayer une période plus longue.
 */
export function PerformanceDashboard({
  report,
  roi,
  basePath,
  preserveParams,
  audience,
  now,
}: {
  report: PerformanceReport;
  roi: SubscriptionReturn | null;
  basePath: string;
  preserveParams?: Record<string, string>;
  audience: Audience;
  now: Date;
}) {
  const { period } = report;
  const comparison = comparisonLabel(period.key);
  // Une autre période repart de zéro : sans clé, le graphique, les univers et les dates gardent l'état de la précédente.
  const periodKey = `${period.key}:${period.from ?? ""}:${period.to ?? ""}`;
  const hasRates = report.series.current.some((bucket) => bucket.acceptanceRate !== null);

  return (
    <div className="space-y-6" data-audience={audience}>
      <PeriodBar key={periodKey} period={period} basePath={basePath} preserveParams={preserveParams} />

      {report.empty ? (
        <>
          <PerformanceEmptyState audience={audience} />
          {roi && <SubscriptionReturnCard roi={roi} audience={audience} />}
          <QualityNotes quality={report.quality} audience={audience} />
        </>
      ) : (
        <div className="space-y-6 motion-safe:animate-fade-in">
          <Hero report={report} comparison={comparison} />
          <KpiRow report={report} comparison={comparison} />

          <EvolutionChart key={periodKey} series={report.series} granularity={period.granularity} comparisonLabel={comparison} showAcceptanceRate={hasRates} />

          {roi && <SubscriptionReturnCard roi={roi} audience={audience} />}

          <HonestFunnel funnel={report.funnel} revenue={report.revenue} />

          <section aria-label="Ce qui marche" className="space-y-3">
            <SectionHeader title="Ce qui marche" description="Les produits et les univers qui rapportent le plus, et que votre équipe retient le plus." />
            <div className="grid gap-4 2xl:grid-cols-5">
              <div className="2xl:col-span-3">
                <ProductsTable products={report.products} />
              </div>
              <div className="2xl:col-span-2">
                <UniverseBars key={periodKey} universes={report.universes} />
              </div>
            </div>
          </section>

          <RhythmHeatmap rhythm={report.rhythm} />

          <Insights insights={report.narrative.insights} />
          <QualityNotes quality={report.quality} audience={audience} />
        </div>
      )}

      <MethodPanel />

      <p className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
        <Sparkles className="size-3.5" aria-hidden="true" />
        <span>Chiffres calculés le {formatDateTime(now)} (heure de Paris).</span>
      </p>
    </div>
  );
}
