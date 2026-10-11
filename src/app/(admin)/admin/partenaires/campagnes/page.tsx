import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { campaignStatsOverview, listCampaignsAdmin, sponsoringTargets } from "@/server/services/mobile/sponsoring-admin";
import { SectionHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SPONSORED_FORMAT_LABELS, SPONSORED_PLACEMENT_LABELS } from "@/core/sponsoring/campaign";
import { formatCtr, isStatPeriod, STAT_PERIODS, type StatTotals } from "@/core/sponsoring/stats";
import { formatCents, formatDate, formatNumber } from "@/lib/format";
import { BillingBadge, CampaignStatusBadge, RegulatoryBadge } from "./_components/labels";
import { CampaignEditor } from "./_components/campaign-editor";
import { PeriodChips, StatTiles, StatsTable } from "./_components/stats";

export const metadata: Metadata = { title: "Campagnes sponsorisées" };

/**
 * Les campagnes sponsorisées de PharmaBoost Mobile : création, cycle de vie, validation réglementaire, facturation
 * saisie par l'équipe, et leurs résultats AGRÉGÉS (impressions, clics, taux de clic, vues, formations, demandes).
 * Aucune donnée nominative dans ces chiffres.
 */
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  await requirePlatformSession();
  const { periode } = await searchParams;
  const period = isStatPeriod(periode) ? periode : "30j";
  const [campaigns, targets, stats] = await Promise.all([listCampaignsAdmin(), sponsoringTargets(), campaignStatsOverview(period)]);
  const zero: StatTotals = { impressions: 0, clicks: 0, views: 0, trainingsStarted: 0, trainingsCompleted: 0, infoRequests: 0, ctr: null };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-bold tracking-[-0.02em] text-text-primary">Campagnes sponsorisées</h1>
          <p className="max-w-2xl text-[14px] text-text-secondary">
            Mises en avant payées par les laboratoires dans l&apos;application mobile. Toujours signalées « Sponsorisé », jamais lues par le moteur de conseil. Diffusion après validation réglementaire.
          </p>
        </div>
        <CampaignEditor targets={targets} />
      </div>

      <section className="space-y-4">
        <SectionHeader title="Résultats" description={`Agrégats par jour et emplacement, sans aucune donnée nominative — ${STAT_PERIODS.find((p) => p.key === period)?.label.toLowerCase()}.`} action={<PeriodChips basePath="/admin/partenaires/campagnes" current={period} />} />
        <StatTiles totals={stats.totals} />
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-[14px] font-semibold text-text-primary">Par emplacement</h3>
            <StatsTable firstColumn="Emplacement" rows={stats.byPlacement.map((row) => ({ key: row.placement, label: SPONSORED_PLACEMENT_LABELS[row.placement], totals: row.totals }))} empty="Aucune impression sur la période." />
          </div>
          <div className="space-y-2">
            <h3 className="text-[14px] font-semibold text-text-primary">Par partenaire</h3>
            <StatsTable firstColumn="Partenaire" rows={stats.byPartner.map((row) => ({ key: row.partnerId, label: row.partnerName, totals: row.totals }))} empty="Aucune impression sur la période." />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Toutes les campagnes" description={`${campaigns.length} campagne${campaigns.length > 1 ? "s" : ""}`} />
        {campaigns.length === 0 ? (
          <Card>
            <EmptyState icon={<Megaphone className="size-5" />} title="Aucune campagne" description="Créez une campagne pour mettre en avant une marque, une nouveauté ou un parcours de formation d'un partenaire." />
          </Card>
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>Campagne</TH>
                  <TH>Étape</TH>
                  <TH>Période</TH>
                  <TH numeric>Impressions</TH>
                  <TH numeric>Clics</TH>
                  <TH numeric>Taux de clic</TH>
                  <TH>Facturation</TH>
                </TR>
              </THead>
              <TBody>
                {campaigns.map((campaign) => {
                  const totals = stats.byCampaign.get(campaign.id) ?? zero;
                  return (
                    <TR key={campaign.id}>
                      <TD>
                        <Link href={`/admin/partenaires/campagnes/${campaign.id}`} className="text-[13.5px] font-semibold text-brand-700 hover:underline">
                          {campaign.name}
                        </Link>
                        <div className="text-[12px] text-text-tertiary">
                          {[campaign.partner.name, campaign.brand?.name, SPONSORED_FORMAT_LABELS[campaign.format]].filter(Boolean).join(" · ")}
                        </div>
                        <div className="text-[11.5px] text-text-tertiary">{campaign.placements.map((p) => SPONSORED_PLACEMENT_LABELS[p]).join(", ")}</div>
                      </TD>
                      <TD>
                        <div className="flex flex-col items-start gap-1">
                          <CampaignStatusBadge status={campaign.status} />
                          <RegulatoryBadge validatedAt={campaign.regulatoryReviewedAt} validatedBy={campaign.regulatoryReviewedBy} />
                        </div>
                      </TD>
                      <TD className="text-[12.5px] whitespace-nowrap">
                        {formatDate(campaign.startsAt)} → {formatDate(campaign.endsAt)}
                      </TD>
                      <TD numeric>{formatNumber(totals.impressions)}</TD>
                      <TD numeric>{formatNumber(totals.clicks)}</TD>
                      <TD numeric>{formatCtr(totals.ctr)}</TD>
                      <TD>
                        <div className="flex flex-col items-start gap-1">
                          <BillingBadge status={campaign.billingStatus} />
                          <span className="text-[12px] text-text-tertiary">
                            {campaign.billedCents !== null ? `${formatCents(campaign.billedCents)} HT facturés` : campaign.budgetCents !== null ? `devis ${formatCents(campaign.budgetCents)} HT` : (campaign.priceNote ?? "tarif à définir")}
                          </span>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </section>
    </div>
  );
}
