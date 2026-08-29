import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, Sparkles, TrendingUp, Users } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { resolvePeriod, isPeriodKey, PERIOD_LABELS, type PeriodKey } from "@/core/analytics/periods";
import { getRevenueSummary } from "@/server/services/analytics";
import { PageHeader, Grid } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LinkTabs } from "@/components/ui/tabs";
import { formatCents, formatDateTime, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Ventes" };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.SALE_VIEW);
  const params = await searchParams;
  const periodKey: PeriodKey = isPeriodKey(params.periode) ? params.periode : "month";
  const period = resolvePeriod(periodKey);

  const [summary, sales] = await Promise.all([
    getRevenueSummary(session.scope, period),
    prisma.sale.findMany({
      where: {
        pharmacyId: session.scope.pharmacyId,
        createdAt: { gte: period.start, lte: period.end },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        prescription: { select: { id: true, reference: true } },
        user: { select: { firstName: true, lastName: true } },
        lines: {
          include: { product: { select: { name: true } } },
        },
      },
    }),
  ]);

  const attributionRate =
    summary.totalCents > 0 ? summary.attributedCents / summary.totalCents : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventes"
        description="Chaque vente issue d'un conseil validé est rattachée à sa recommandation. Le chiffre d'affaires additionnel est constaté, jamais estimé."
      />

      <LinkTabs
        paramName="periode"
        items={(["month", "week", "today", "quarter", "year"] as PeriodKey[]).map((key) => ({
          key,
          label: PERIOD_LABELS[key],
        }))}
      />

      <Grid cols={4}>
        <StatCard
          label="CA généré grâce à Pharma.ai"
          value={formatCents(summary.attributedCents)}
          sublabel={`marge ${formatCents(summary.attributedMarginCents)}`}
          delta={summary.attributedDelta}
          emphasis="accent"
          icon={<Sparkles className="size-4" />}
        />
        <StatCard
          label="Chiffre d'affaires total"
          value={formatCents(summary.totalCents)}
          sublabel={`${summary.salesCount} vente(s)`}
          delta={summary.totalDelta}
          icon={<Receipt className="size-4" />}
        />
        <StatCard
          label="Part attribuable"
          value={formatPercent(attributionRate)}
          sublabel="du chiffre d'affaires enregistré"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Ventes avec conseil"
          value={summary.attributedSalesCount}
          sublabel={
            summary.salesCount > 0
              ? `sur ${summary.salesCount} vente(s)`
              : "aucune vente sur la période"
          }
          icon={<Users className="size-4" />}
        />
      </Grid>

      {sales.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt className="size-5" />}
            title="Aucune vente sur cette période"
            description="Les ventes complémentaires enregistrées au comptoir apparaîtront ici."
          />
        </Card>
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Référence</TH>
                <TH>Patient</TH>
                <TH>Produits</TH>
                <TH>Ordonnance</TH>
                <TH numeric>Total</TH>
                <TH numeric>Dont Pharma.ai</TH>
                <TH>Par</TH>
                <TH>Date</TH>
              </TR>
            </THead>
            <TBody>
              {sales.map((sale) => (
                <TR key={sale.id} interactive>
                  <TD className="font-mono text-[12px]">{sale.reference}</TD>
                  <TD>
                    {sale.patient ? (
                      <Link href={`/patients/${sale.patient.id}`} className="hover:underline">
                        {sale.patient.firstName} {sale.patient.lastName.toUpperCase()}
                      </Link>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </TD>
                  <TD className="max-w-[260px] truncate text-text-secondary">
                    {sale.lines.map((line) => line.label).join(", ")}
                  </TD>
                  <TD>
                    {sale.prescription ? (
                      <Link
                        href={`/vente/${sale.prescription.id}`}
                        className="font-mono text-[12px] hover:underline"
                      >
                        {sale.prescription.reference}
                      </Link>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </TD>
                  <TD numeric className="font-medium">
                    {formatCents(sale.totalCents)}
                  </TD>
                  <TD numeric>
                    {sale.attributedCents > 0 ? (
                      <Badge tone="accent">{formatCents(sale.attributedCents)}</Badge>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </TD>
                  <TD className="text-text-secondary">
                    {sale.user ? `${sale.user.firstName} ${sale.user.lastName}` : "—"}
                  </TD>
                  <TD className="text-text-secondary">{formatDateTime(sale.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}
    </div>
  );
}
