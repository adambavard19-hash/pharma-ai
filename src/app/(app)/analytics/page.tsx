import type { Metadata } from "next";
import {
  Award,
  BarChart3,
  Package,
  Receipt,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import {
  isPeriodKey,
  PERIOD_LABELS,
  resolvePeriod,
  type PeriodKey,
} from "@/core/analytics/periods";
import {
  getActivitySummary,
  getCategoryPerformance,
  getDailyRevenueSeries,
  getDeclinedRecommendations,
  getProductPerformance,
  getRecommendationFunnel,
  getRevenueSummary,
  getTeamPerformance,
} from "@/server/services/analytics";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { PageHeader, Grid } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { LinkTabs } from "@/components/ui/tabs";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AreaChart } from "@/components/charts/area-chart";
import { RankedBarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { Funnel } from "@/components/charts/funnel";
import { formatCents, formatCentsCompact, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/server/rbac/permissions";
import type { ProductCategoryCode } from "@/core/ai/types";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  const params = await searchParams;
  const periodKey: PeriodKey = isPeriodKey(params.periode) ? params.periode : "month";
  const period = resolvePeriod(periodKey);

  const canSeeTeam = session.permissions.has(
    PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE,
  );

  const [revenue, funnel, activity, series, products, categories, declined, team] =
    await Promise.all([
      getRevenueSummary(session.scope, period),
      getRecommendationFunnel(session.scope, period),
      getActivitySummary(session.scope, period),
      getDailyRevenueSeries(session.scope, period),
      getProductPerformance(session.scope, period, 10),
      getCategoryPerformance(session.scope, period),
      getDeclinedRecommendations(session.scope, period, 12),
      canSeeTeam
        ? getTeamPerformance(session.scope, period)
        : Promise.resolve([]),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="La valeur créée par Pharma.ai, mesurée sur des ventes réelles rattachées à des conseils validés."
      />

      <LinkTabs
        paramName="periode"
        items={(["month", "week", "today", "quarter", "year"] as PeriodKey[]).map((key) => ({
          key,
          label: PERIOD_LABELS[key],
        }))}
      />

      <section className="rounded-2xl border border-accent-200 bg-gradient-to-br from-accent-50 via-surface-card to-surface-card p-6 dark:border-accent-800/60 dark:from-accent-900/25 dark:via-surface-card dark:to-surface-card">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-accent-800 dark:text-accent-200">
              <Sparkles className="size-4" />
              Chiffre d&apos;affaires généré grâce à Pharma.ai
            </p>
            <p className="text-[42px] leading-[1.05] font-semibold tracking-[-0.03em] tabular text-accent-900 dark:text-accent-100">
              {formatCents(revenue.attributedCents)}
            </p>
            <p className="text-[13px] text-text-secondary">
              {PERIOD_LABELS[periodKey].toLowerCase()} · marge{" "}
              {formatCents(revenue.attributedMarginCents)} ·{" "}
              {formatNumber(revenue.attributedSalesCount)} vente(s) rattachée(s)
            </p>
          </div>

          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
            <MiniStat
              label="Part du CA total"
              value={
                revenue.totalCents > 0
                  ? formatPercent(revenue.attributedCents / revenue.totalCents)
                  : "—"
              }
            />
            <MiniStat
              label="Panier moyen"
              value={formatCents(activity.averageBasketCents)}
            />
            <MiniStat
              label="Par ordonnance"
              value={formatCents(activity.averageRevenuePerPrescriptionCents)}
            />
          </dl>
        </div>
      </section>

      <Grid cols={4}>
        <StatCard
          label="Chiffre d'affaires total"
          value={formatCents(revenue.totalCents)}
          sublabel={`${formatNumber(revenue.salesCount)} vente(s)`}
          delta={revenue.totalDelta}
          icon={<Receipt className="size-4" />}
        />
        <StatCard
          label="Ordonnances analysées"
          value={formatNumber(activity.prescriptionsAnalyzed)}
          sublabel={`${formatNumber(activity.patientsSeen)} patient(s)`}
          icon={<BarChart3 className="size-4" />}
        />
        <StatCard
          label="Taux d'acceptation"
          value={formatPercent(funnel.acceptanceRate)}
          sublabel="conseils validés par un pharmacien"
          icon={<Award className="size-4" />}
        />
        <StatCard
          label="Taux de conversion"
          value={formatPercent(funnel.conversionRate)}
          sublabel="présentés → achetés"
          icon={<TrendingUp className="size-4" />}
          emphasis="brand"
        />
      </Grid>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Évolution"
            description="Chiffre d'affaires total et part générée grâce à Pharma.ai."
          />
          <CardContent>
            <AreaChart
              data={series}
              formatValue={formatCentsCompact}
              primaryLabel="CA total"
              secondaryLabel="CA généré grâce à Pharma.ai"
              showSecondary
              height={260}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Entonnoir du conseil" description="Du conseil proposé à l'achat." />
          <CardContent>
            <Funnel
              steps={[
                { label: "Conseils proposés", value: funnel.generated },
                { label: "Validés", value: funnel.accepted },
                { label: "Présentés au patient", value: funnel.presented },
                { label: "Achetés", value: funnel.purchased },
              ]}
              formatValue={formatNumber}
            />
            <dl className="mt-4 space-y-2 border-t border-border-subtle pt-3">
              <FunnelStat label="Proposés par le moteur" value={funnel.aiGenerated} />
              <FunnelStat label="Ajoutés par un pharmacien" value={funnel.manuallyAdded} />
              <FunnelStat label="Retirés avant présentation" value={funnel.removed} />
              <FunnelStat label="Non retenus par le patient" value={funnel.declined} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Produits les plus performants"
            description="Chiffre d'affaires généré par les conseils validés."
          />
          <CardContent>
            <RankedBarChart
              data={products.map((product) => ({
                label: product.name,
                value: product.revenueCents,
              }))}
              formatValue={formatCents}
              tone="accent"
              emptyLabel="Aucune vente issue d'un conseil sur cette période."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Catégories les plus performantes"
            description="Répartition du chiffre d'affaires additionnel."
          />
          <CardContent>
            <DonutChart
              slices={categories
                .filter((category) => category.revenueCents > 0)
                .slice(0, 6)
                .map((category) => ({
                  label:
                    PRODUCT_CATEGORY_LABELS[category.category as ProductCategoryCode] ??
                    category.category,
                  value: category.revenueCents,
                }))}
              formatValue={formatCents}
              centerValue={formatCentsCompact(revenue.attributedCents)}
              centerLabel="CA additionnel"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Détail par produit"
          description="Proposés, acceptés, achetés — et ce que cela représente."
        />
        <CardContent className="px-0 pb-0">
          {products.length === 0 ? (
            <EmptyState
              icon={<Package className="size-5" />}
              title="Aucune donnée sur cette période"
              description="Analysez des ordonnances pour alimenter ces statistiques."
            />
          ) : (
            <TableWrapper className="rounded-none border-x-0 border-b-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Produit</TH>
                    <TH>Catégorie</TH>
                    <TH numeric>Proposé</TH>
                    <TH numeric>Accepté</TH>
                    <TH numeric>Acheté</TH>
                    <TH numeric>Conversion</TH>
                    <TH numeric>CA généré</TH>
                    <TH numeric>Marge</TH>
                  </TR>
                </THead>
                <TBody>
                  {products.map((product) => (
                    <TR key={product.productId}>
                      <TD className="font-medium">{product.name}</TD>
                      <TD className="text-text-secondary">
                        {PRODUCT_CATEGORY_LABELS[product.category as ProductCategoryCode] ??
                          product.category}
                      </TD>
                      <TD numeric>{product.proposed}</TD>
                      <TD numeric>{product.accepted}</TD>
                      <TD numeric>{product.purchased}</TD>
                      <TD numeric className="text-text-secondary">
                        {product.proposed > 0
                          ? formatPercent(product.purchased / product.proposed)
                          : "—"}
                      </TD>
                      <TD numeric className="font-medium">
                        {formatCents(product.revenueCents)}
                      </TD>
                      <TD numeric className="text-text-secondary">
                        {formatCents(product.marginCents)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>

      {canSeeTeam && team.length > 0 && (
        <Card>
          <CardHeader
            title="Performance par collaborateur"
            description="Activité de l'équipe sur la période."
          />
          <CardContent className="space-y-4">
            <Alert tone="warning" title="Suivi de l'activité des salariés">
              Ces indicateurs nominatifs relèvent du suivi de l&apos;activité professionnelle.
              Leur mise en œuvre suppose une information préalable des personnes concernées, la
              consultation des représentants du personnel le cas échéant, un usage proportionné
              et une durée de conservation limitée. À faire valider avant toute exploitation
              managériale.
            </Alert>

            <ul className="divide-y divide-border-subtle">
              {team.map((member) => (
                <li key={member.userId} className="flex flex-wrap items-center gap-4 py-3">
                  <Avatar size="sm" initials={member.initials} name={member.fullName} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-text-primary">
                      {member.fullName}
                    </p>
                    <p className="text-[11.5px] text-text-tertiary">
                      {ROLE_LABELS[member.role as Role] ?? member.role}
                    </p>
                  </div>
                  <dl className="flex flex-wrap gap-x-6 gap-y-1">
                    <MiniStat label="Ordonnances" value={formatNumber(member.prescriptionsHandled)} />
                    <MiniStat label="Conseils décidés" value={formatNumber(member.recommendationsDecided)} />
                    <MiniStat
                      label="Acceptation"
                      value={
                        member.recommendationsDecided > 0
                          ? formatPercent(member.acceptanceRate)
                          : "—"
                      }
                    />
                    <MiniStat label="CA Pharma.ai" value={formatCents(member.attributedCents)} />
                  </dl>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {declined.length > 0 && (
        <Card>
          <CardHeader
            title="Conseils écartés"
            description="Comprendre les refus est aussi utile que mesurer les succès."
          />
          <CardContent className="pt-0">
            <ul className="divide-y divide-border-subtle">
              {declined.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                    {item.productName}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-secondary">
                    {item.reason}
                  </span>
                  <Badge tone="neutral">{STATUS_LABELS[item.status] ?? item.status}</Badge>
                  <span className="text-[11.5px] text-text-tertiary">
                    {item.decidedBy ?? "—"} · {formatDate(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-text-tertiary uppercase">
        {label}
      </dt>
      <dd className="text-[14px] font-semibold tabular text-text-primary">{value}</dd>
    </div>
  );
}

function FunnelStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12.5px] text-text-secondary">{label}</dt>
      <dd className="text-[13px] font-medium tabular text-text-primary">
        {formatNumber(value)}
      </dd>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  REMOVED: "Retiré",
  DECLINED: "Non retenu",
  REPLACED: "Remplacé",
};
