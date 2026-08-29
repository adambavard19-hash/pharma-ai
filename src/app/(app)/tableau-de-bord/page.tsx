import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardList,
  Euro,
  Package,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { prisma } from "@/server/db/client";
import { resolvePeriod } from "@/core/analytics/periods";
import {
  getActivitySummary,
  getDailyRevenueSeries,
  getProductPerformance,
  getRecommendationFunnel,
  getRevenueSummary,
} from "@/server/services/analytics";
import { formatCents, formatCentsCompact, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { PageHeader, Grid } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, Dot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { AreaChart } from "@/components/charts/area-chart";
import { RankedBarChart } from "@/components/charts/bar-chart";
import { Funnel } from "@/components/charts/funnel";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { stockStatus } from "@/server/services/catalog";
import type { ProductCategoryCode } from "@/core/ai/types";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default async function DashboardPage() {
  const session = await requireSession();
  const { scope } = session;

  const today = resolvePeriod("today");
  const week = resolvePeriod("week");
  const month = resolvePeriod("month");

  const [
    todayRevenue,
    weekRevenue,
    monthRevenue,
    funnel,
    activity,
    series,
    topProducts,
    lowStock,
    recentActivity,
    pendingPrescriptions,
  ] = await Promise.all([
    getRevenueSummary(scope, today),
    getRevenueSummary(scope, week),
    getRevenueSummary(scope, month),
    getRecommendationFunnel(scope, month),
    getActivitySummary(scope, month),
    getDailyRevenueSeries(scope, resolvePeriod("month")),
    getProductPerformance(scope, month, 6),
    prisma.stockItem.findMany({
      where: {
        pharmacyId: scope.pharmacyId,
        product: { isActive: true, deletedAt: null },
        OR: [{ quantity: 0 }, { quantity: { lte: prisma.stockItem.fields.alertThreshold } }],
      },
      include: { product: { select: { id: true, name: true, brand: true, category: true } } },
      orderBy: { quantity: "asc" },
      take: 6,
    }),
    prisma.recommendationEvent.findMany({
      where: { recommendation: { pharmacyId: scope.pharmacyId } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { firstName: true, lastName: true } },
        recommendation: {
          select: {
            product: { select: { name: true } },
            prescription: { select: { id: true, reference: true } },
          },
        },
      },
    }),
    prisma.prescription.count({
      where: {
        pharmacyId: scope.pharmacyId,
        deletedAt: null,
        status: { in: ["NEEDS_VERIFICATION", "EXTRACTING", "DRAFT"] },
      },
    }),
  ]);

  const canSeeRevenue = session.permissions.has(PERMISSIONS.ANALYTICS_VIEW);

  return (
    <div className="space-y-7">
      <PageHeader
        title={`Bonjour ${session.user.firstName}`}
        description={`${session.pharmacy.name}${session.pharmacy.city ? ` · ${session.pharmacy.city}` : ""} — voici l'activité de votre officine.`}
        actions={
          session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE) ? (
            <Button asChild size="lg" leadingIcon={<Plus className="size-[18px]" />}>
              <Link href="/vente/nouvelle">Nouvelle vente</Link>
            </Button>
          ) : null
        }
      />

      {pendingPrescriptions > 0 && (
        <Link
          href="/ordonnances?statut=a-verifier"
          className="flex items-center gap-3 rounded-xl border border-info-200 bg-info-50 px-4 py-3 transition-colors hover:border-info-300 dark:border-info-700/40 dark:bg-info-700/10"
        >
          <ClipboardList className="size-[18px] shrink-0 text-info-600 dark:text-info-500" />
          <p className="min-w-0 flex-1 text-[13.5px] text-text-primary">
            <span className="font-semibold">
              {pendingPrescriptions} ordonnance{pendingPrescriptions > 1 ? "s" : ""}
            </span>{" "}
            en attente de vérification par un pharmacien.
          </p>
          <ArrowRight className="size-4 shrink-0 text-info-600 dark:text-info-500" />
        </Link>
      )}

      {canSeeRevenue && (
        <section className="space-y-4">
          <Grid cols={4}>
            <StatCard
              label="CA généré grâce à Pharma.ai"
              value={formatCents(monthRevenue.attributedCents)}
              sublabel="ce mois"
              delta={monthRevenue.attributedDelta}
              emphasis="accent"
              icon={<Sparkles className="size-4" />}
              footer={
                <p className="text-[11.5px] leading-4 text-accent-800/80 dark:text-accent-200/80">
                  {formatNumber(monthRevenue.attributedSalesCount)} vente
                  {monthRevenue.attributedSalesCount > 1 ? "s" : ""} rattachée
                  {monthRevenue.attributedSalesCount > 1 ? "s" : ""} à un conseil validé ·
                  marge {formatCents(monthRevenue.attributedMarginCents)}
                </p>
              }
            />
            <StatCard
              label="Chiffre d'affaires aujourd'hui"
              value={formatCents(todayRevenue.totalCents)}
              sublabel={`dont ${formatCents(todayRevenue.attributedCents)} via Pharma.ai`}
              delta={todayRevenue.totalDelta}
              icon={<Euro className="size-4" />}
            />
            <StatCard
              label="Cette semaine"
              value={formatCents(weekRevenue.totalCents)}
              sublabel={`dont ${formatCents(weekRevenue.attributedCents)} via Pharma.ai`}
              delta={weekRevenue.totalDelta}
              icon={<TrendingUp className="size-4" />}
            />
            <StatCard
              label="Ce mois"
              value={formatCents(monthRevenue.totalCents)}
              sublabel={`${formatNumber(monthRevenue.salesCount)} vente(s) enregistrée(s)`}
              delta={monthRevenue.totalDelta}
              icon={<Euro className="size-4" />}
            />
          </Grid>
        </section>
      )}

      <Grid cols={4}>
        <StatCard
          label="Ordonnances analysées"
          value={formatNumber(activity.prescriptionsAnalyzed)}
          sublabel="ce mois"
          icon={<ClipboardList className="size-4" />}
          emphasis="brand"
        />
        <StatCard
          label="Conseils proposés"
          value={formatNumber(funnel.generated)}
          sublabel={`${formatNumber(funnel.aiGenerated)} par le moteur · ${formatNumber(funnel.manuallyAdded)} ajoutés`}
          icon={<Sparkles className="size-4" />}
        />
        <StatCard
          label="Taux de conversion"
          value={formatPercent(funnel.conversionRate)}
          sublabel="conseils présentés → achetés"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Panier complémentaire moyen"
          value={formatCents(activity.averageBasketCents)}
          sublabel={`${formatCents(activity.averageRevenuePerPrescriptionCents)} par ordonnance`}
          icon={<Package className="size-4" />}
        />
      </Grid>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Évolution du chiffre d'affaires"
            description="Chiffre d'affaires total et part attribuable à Pharma.ai, jour par jour."
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/analytics">Analytics</Link>
              </Button>
            }
          />
          <CardContent>
            <AreaChart
              data={series}
              formatValue={formatCentsCompact}
              primaryLabel="CA total"
              secondaryLabel="CA généré grâce à Pharma.ai"
              showSecondary
              height={250}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Du conseil à la vente"
            description="Ce mois, étape par étape."
          />
          <CardContent>
            <Funnel
              steps={[
                { label: "Conseils proposés", value: funnel.generated },
                { label: "Validés par un pharmacien", value: funnel.accepted },
                { label: "Présentés au patient", value: funnel.presented },
                { label: "Achetés", value: funnel.purchased },
              ]}
              formatValue={formatNumber}
            />
            <p className="mt-4 border-t border-border-subtle pt-3 text-[12px] leading-5 text-text-tertiary">
              {funnel.removed > 0 && (
                <>
                  {formatNumber(funnel.removed)} conseil
                  {funnel.removed > 1 ? "s ont" : " a"} été retiré
                  {funnel.removed > 1 ? "s" : ""} par un pharmacien avant présentation.{" "}
                </>
              )}
              Le pharmacien reste décisionnaire à chaque étape.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Conseils les plus performants"
            description="Chiffre d'affaires généré ce mois."
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/analytics">Détail</Link>
              </Button>
            }
          />
          <CardContent>
            <RankedBarChart
              data={topProducts.map((product) => ({
                label: product.name,
                value: product.revenueCents,
              }))}
              formatValue={formatCents}
              tone="accent"
              emptyLabel="Aucune vente issue d'un conseil ce mois."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Stock à surveiller"
            description="Produits en rupture ou proches du seuil d'alerte."
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/stocks">Stocks</Link>
              </Button>
            }
          />
          <CardContent className="pt-0">
            {lowStock.length === 0 ? (
              <EmptyState
                icon={<Boxes className="size-5" />}
                title="Tout est disponible"
                description="Aucun produit du catalogue n'est sous son seuil d'alerte."
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {lowStock.map((item) => {
                  const status = stockStatus(item.quantity, item.alertThreshold);
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/produits/${item.product.id}`}
                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-sunken"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium text-text-primary">
                            {item.product.name}
                          </span>
                          <span className="block truncate text-[12px] text-text-tertiary">
                            {item.product.brand ??
                              PRODUCT_CATEGORY_LABELS[
                                item.product.category as ProductCategoryCode
                              ]}
                          </span>
                        </span>
                        <Badge tone={status === "OUT_OF_STOCK" ? "danger" : "warning"}>
                          {item.quantity === 0
                            ? "Rupture"
                            : `${item.quantity} restant${item.quantity > 1 ? "s" : ""}`}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Activité récente de l'équipe"
            description="Décisions prises sur les conseils."
          />
          <CardContent className="pt-0">
            {recentActivity.length === 0 ? (
              <EmptyState
                icon={<Users className="size-5" />}
                title="Aucune activité"
                description="Les décisions de votre équipe apparaîtront ici."
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {recentActivity.map((event) => (
                  <li key={event.id} className="flex items-start gap-3 py-2.5">
                    {event.user ? (
                      <Avatar
                        size="sm"
                        initials={`${event.user.firstName.at(0) ?? ""}${event.user.lastName.at(0) ?? ""}`}
                        name={`${event.user.firstName} ${event.user.lastName}`}
                      />
                    ) : (
                      <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                        <Sparkles className="size-3.5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-5 text-text-primary">
                        <span className="font-medium">
                          {event.user
                            ? `${event.user.firstName} ${event.user.lastName}`
                            : "Moteur Pharma.ai"}
                        </span>{" "}
                        <span className="text-text-secondary">
                          {EVENT_LABELS[event.type] ?? event.type.toLowerCase()}
                        </span>{" "}
                        {event.recommendation.product && (
                          <span className="font-medium">
                            {event.recommendation.product.name}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-text-tertiary">
                        <Dot tone={EVENT_TONES[event.type] ?? "neutral"} />
                        {formatRelative(event.createdAt)}
                        {event.recommendation.prescription && (
                          <>
                            {" · "}
                            <Link
                              href={`/ordonnances/${event.recommendation.prescription.id}`}
                              className="hover:text-text-secondary hover:underline"
                            >
                              {event.recommendation.prescription.reference}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-brand-200 bg-brand-50/50 dark:border-brand-800/50 dark:bg-brand-950/40">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-5">
          <AlertTriangle className="size-[18px] shrink-0 text-brand-700 dark:text-brand-400" />
          <p className="min-w-0 flex-1 text-[12.5px] leading-5 text-text-secondary">
            Pharma.ai est un outil d&apos;assistance. Il ne prescrit pas, ne pose aucun
            diagnostic et ne se substitue à aucun avis médical ou pharmaceutique. Chaque
            conseil affiché au patient a été validé par un professionnel de votre équipe.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  GENERATED: "a proposé",
  VIEWED: "a consulté",
  ACCEPTED: "a validé",
  MODIFIED: "a modifié",
  REPLACED: "a remplacé",
  REMOVED: "a retiré",
  MANUALLY_ADDED: "a ajouté",
  PRESENTED_TO_PATIENT: "a présenté au patient",
  PURCHASED: "a enregistré l'achat de",
  DECLINED_BY_PATIENT: "a noté le refus de",
};

const EVENT_TONES: Record<
  string,
  "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info"
> = {
  GENERATED: "brand",
  ACCEPTED: "success",
  MODIFIED: "info",
  REPLACED: "info",
  REMOVED: "warning",
  MANUALLY_ADDED: "brand",
  PRESENTED_TO_PATIENT: "info",
  PURCHASED: "accent",
  DECLINED_BY_PATIENT: "neutral",
};
