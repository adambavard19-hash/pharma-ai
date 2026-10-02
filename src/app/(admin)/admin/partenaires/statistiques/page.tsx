import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChartColumn, Eye, Inbox, ShieldOff, ShoppingCart, Store } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { isStatsPeriod, partnerStatistics, STATS_PERIODS, type Activity, type ReachTotals } from "@/server/services/partners/stats";
import { PageHeader, Grid, SectionHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CONTRACT_TYPE_LABELS } from "@/core/partners/status";
import { formatCents, formatDate, formatNumber } from "@/lib/format";
import { PublicationBadge } from "../marques/_components/publication-badge";

export const metadata: Metadata = { title: "Statistiques partenaires" };

const views = (activity: Activity) => activity.viewsCounter + activity.viewsCatalog + activity.viewsBrandPage;

function Amount({ activity }: { activity: Activity }) {
  return (
    <>
      {formatCents(activity.amountCents)}
      {activity.ordersWithoutAmount > 0 && <span className="block text-[11.5px] font-normal text-text-tertiary">+ {activity.ordersWithoutAmount} sans montant</span>}
    </>
  );
}

type StatsRow = { key: string; title: ReactNode; subtitle: ReactNode; reach: ReachTotals; activity: Activity };

/** Un tableau d'agrégats : liste sur mobile, tableau à partir de md. */
function StatsTable({ rows, firstColumn }: { rows: StatsRow[]; firstColumn: string }) {
  return (
    <>
      <ul className="space-y-2.5 md:hidden">
        {rows.map((row) => (
          <li key={row.key} className="space-y-2 rounded-xl border border-border-subtle bg-surface-card p-4">
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-text-primary">{row.title}</div>
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-text-tertiary">{row.subtitle}</div>
            </div>
            <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-[12.5px]">
              {[
                ["Visible", formatNumber(row.reach.visible)],
                ["Masquée", formatNumber(row.reach.hidden)],
                ["Refusée", formatNumber(row.reach.refused)],
                ["Ouv. comptoir", formatNumber(row.activity.viewsCounter)],
                ["Ouv. catalogue", formatNumber(row.activity.viewsCatalog + row.activity.viewsBrandPage)],
                ["Leads", formatNumber(row.activity.leads)],
                ["Commandes", formatNumber(row.activity.orders)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-text-tertiary">{label}</dt>
                  <dd className="font-medium text-text-primary tabular">{value}</dd>
                </div>
              ))}
              <div className="col-span-2">
                <dt className="text-text-tertiary">Montant HT</dt>
                <dd className="font-medium text-text-primary tabular">
                  <Amount activity={row.activity} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <TableWrapper className="hidden md:block">
        <Table>
          <THead>
            <TR>
              <TH>{firstColumn}</TH>
              <TH numeric>Visible</TH>
              <TH numeric>Masquée</TH>
              <TH numeric>Refusée</TH>
              <TH numeric>Ouv. comptoir</TH>
              <TH numeric>Ouv. catalogue</TH>
              <TH numeric>Leads</TH>
              <TH numeric>Commandes</TH>
              <TH numeric>Montant HT</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.key}>
                <TD>
                  <div className="text-[13px] font-medium">{row.title}</div>
                  <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary">{row.subtitle}</div>
                </TD>
                <TD numeric>{formatNumber(row.reach.visible)}</TD>
                <TD numeric>{formatNumber(row.reach.hidden)}</TD>
                <TD numeric>{formatNumber(row.reach.refused)}</TD>
                <TD numeric>{formatNumber(row.activity.viewsCounter)}</TD>
                <TD numeric>{formatNumber(row.activity.viewsCatalog + row.activity.viewsBrandPage)}</TD>
                <TD numeric>{formatNumber(row.activity.leads)}</TD>
                <TD numeric>{formatNumber(row.activity.orders)}</TD>
                <TD numeric className="font-medium">
                  <Amount activity={row.activity} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrapper>
    </>
  );
}

/**
 * Ce que PharmaBoost Partenaires produit, en agrégats : diffusion des
 * marques, ouvertures attribuées, leads, commandes. Hors officines de
 * démonstration, hors commandes annulées ou en échec. Aucune donnée patient,
 * aucune ligne nominative. Les commissions sont des estimations indicatives.
 */
export default async function PartnerStatisticsPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  await requirePlatformSession();
  const { periode } = await searchParams;
  const period = isStatsPeriod(periode) ? periode : "tout";
  const stats = await partnerStatistics(period);
  const periodLabel = STATS_PERIODS.find((entry) => entry.key === period)?.label ?? "";
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-[12.5px] font-medium ${active ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300" : "border-border-default text-text-secondary"}`;
  const contracts = stats.partners.flatMap((partner) => partner.contracts.map((contract) => ({ ...contract, partnerName: partner.name })));

  return (
    <>
      <PageHeader title="Statistiques" description="Diffusion des marques, ouvertures, leads et commandes attribués à PharmaBoost, par partenaire et par marque." />

      <Alert tone="info" title="Agrégats uniquement" icon={<ShieldOff className="size-[18px]" aria-hidden="true" />}>
        Des compteurs, jamais une officine nommée ni un patient. Les officines de démonstration sont exclues ; les commandes annulées ou en échec ne comptent pas. La diffusion est l&apos;état actuel ; ouvertures, leads et commandes portent sur la période choisie.
      </Alert>

      <div className="flex flex-wrap gap-1.5">
        {STATS_PERIODS.map((entry) => (
          <Link key={entry.key} href={entry.key === "tout" ? "/admin/partenaires/statistiques" : `/admin/partenaires/statistiques?periode=${entry.key}`} className={chip(entry.key === period)}>
            {entry.label}
          </Link>
        ))}
      </div>

      <Grid cols={4}>
        <StatCard
          label="Officines touchées"
          value={formatNumber(stats.reachedPharmacies)}
          sublabel={`voient au moins une marque, sur ${formatNumber(stats.realPharmacies)}`}
          icon={<Store className="size-4" />}
        />
        <StatCard
          label="Ouvertures attribuées"
          value={formatNumber(views(stats.totals))}
          sublabel={`${formatNumber(stats.totals.viewsCounter)} comptoir · ${formatNumber(stats.totals.viewsCatalog)} catalogue · ${formatNumber(stats.totals.viewsBrandPage)} page marque`}
          icon={<Eye className="size-4" />}
        />
        <StatCard label="Leads" value={formatNumber(stats.totals.leads)} sublabel={periodLabel.toLowerCase()} icon={<Inbox className="size-4" />} />
        <StatCard
          label="Commandes"
          value={formatNumber(stats.totals.orders)}
          sublabel={`${formatCents(stats.totals.amountCents)} HT${stats.totals.ordersWithoutAmount ? ` · ${stats.totals.ordersWithoutAmount} sans montant` : ""}`}
          icon={<ShoppingCart className="size-4" />}
          emphasis="accent"
        />
      </Grid>

      <section className="space-y-3">
        <SectionHeader title="Par partenaire" description="Diffusion : officines distinctes sur l'ensemble de ses marques." />
        {stats.partners.length === 0 ? (
          <Card>
            <EmptyState icon={<ChartColumn className="size-5" />} title="Aucun partenaire" description="Les chiffres apparaîtront dès qu'un partenaire aura des marques diffusées." />
          </Card>
        ) : (
          <StatsTable
            firstColumn="Partenaire"
            rows={stats.partners.map((partner) => ({
              key: partner.id,
              title: partner.name,
              subtitle: (
                <>
                  <PublicationBadge status={partner.status} /> {partner.brands} marque{partner.brands > 1 ? "s" : ""}
                </>
              ),
              reach: partner.reach,
              activity: partner.activity,
            }))}
          />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Par marque" />
        {stats.brands.length === 0 ? (
          <Card>
            <EmptyState icon={<ChartColumn className="size-5" />} title="Aucune marque" description="Créez et publiez une marque pour suivre sa diffusion." />
          </Card>
        ) : (
          <StatsTable
            firstColumn="Marque"
            rows={stats.brands.map((brand) => ({
              key: brand.id,
              title: (
                <Link href={`/admin/partenaires/marques/${brand.id}`} className="hover:underline">
                  {brand.name}
                </Link>
              ),
              subtitle: (
                <>
                  <PublicationBadge status={brand.status} /> {brand.partnerName}
                </>
              ),
              reach: brand.reach,
              activity: brand.activity,
            }))}
          />
        )}
        <p className="text-[12px] text-text-tertiary">« Ouv. catalogue » additionne les ouvertures depuis le catalogue et depuis la page de la marque.</p>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Commission estimée" description="Indicative, non facturée : par contrat en cours, sur les commandes attribuées depuis son début." />
        {contracts.length === 0 ? (
          <Card>
            <EmptyState icon={<ChartColumn className="size-5" />} title="Aucun contrat en cours" description="Les contrats se saisissent dans la fiche de chaque partenaire. Sans contrat en cours, aucune estimation n'est faite." />
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {contracts.map((contract) => (
              <li key={contract.id}>
                <Card className="h-full">
                  <CardContent className="space-y-1.5 pt-4">
                    <p className="text-[14px] font-semibold text-text-primary">
                      {contract.partnerName} · {CONTRACT_TYPE_LABELS[contract.type]}
                    </p>
                    <p className="text-[12.5px] text-text-tertiary">
                      {contract.startsAt ? `depuis le ${formatDate(contract.startsAt)}` : "sans date de début"}
                      {contract.endsAt ? ` · jusqu'au ${formatDate(contract.endsAt)}` : ""}
                    </p>
                    <p className="text-[13px] text-text-secondary">
                      {formatNumber(contract.volume.orders)} commande{contract.volume.orders > 1 ? "s" : ""} · {formatNumber(contract.volume.units)} unité{contract.volume.units > 1 ? "s" : ""} · {formatCents(contract.volume.amountCents)} HT
                    </p>
                    <p className="text-[15px] font-semibold text-text-primary tabular">
                      {formatCents(contract.estimate.totalCents)}
                      <span className="ml-1.5 text-[12px] font-normal text-text-tertiary">
                        {contract.estimate.fixedCents > 0 ? `forfait ${formatCents(contract.estimate.fixedCents)} + variable ${formatCents(contract.estimate.variableCents)}` : ""}
                      </span>
                    </p>
                    <p className="text-[12px] text-text-tertiary">{/indicative/i.test(contract.estimate.note) ? contract.estimate.note : `${contract.estimate.note} · estimation indicative, non facturée`}.</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
