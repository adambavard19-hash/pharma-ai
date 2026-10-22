import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";
import { BadgePercent, Crown, Euro, Smartphone } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getLabOffersOverview } from "@/server/services/patient-offers";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCents } from "@/lib/format";
import { OfferForm } from "@/components/patient-offers/offer-form";
import { CancelOfferButton } from "@/components/patient-offers/cancel-offer-button";

export const metadata: Metadata = { title: "Offres laboratoires" };

const day = (date: Date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

/**
 * Les offres de l'appli des patients payées par les laboratoires (fondateur, 22 oct. 2026) : une remise valable dans toutes
 * les pharmacies PharmaBoost ; chaque boîte vendue avec l'offre est constatée par le bip du code au comptoir, et le
 * laboratoire paie PharmaBoost à la boîte. La console voit ce que chacun doit.
 */
export default async function LabOffersPage() {
  if (!PATIENT_APP_LIVE) notFound();
  await requirePlatformSession();
  const overview = await getLabOffersOverview();
  const now = new Date();
  const due = overview.offers.reduce((sum, offer) => sum + offer.dueCents, 0);
  const redeemed = overview.offers.reduce((sum, offer) => sum + offer.stats.redeemed, 0);
  return (
    <div className="space-y-6">
      <AdminPageHeader space={{ label: "Gestion" }} title="Offres laboratoires" description="Les remises payées par les laboratoires dans l'appli des patients, et ce qu'ils doivent à PharmaBoost." />
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Inscrits de l'appli" value={overview.members.total} icon={<Smartphone className="size-4" />} />
        <StatCard label="Abonnés PharmaBoost+" value={overview.members.plus} icon={<Crown className="size-4" />} />
        <StatCard label="Boîtes vendues avec une offre" value={redeemed} icon={<BadgePercent className="size-4" />} />
        <StatCard label="À facturer aux laboratoires" value={formatCents(due)} icon={<Euro className="size-4" />} emphasis="default" />
      </div>
      <OfferForm kind="lab" partners={overview.partners} />
      <Card>
        <CardHeader title="Offres publiées" />
        <CardContent>
          {overview.offers.length === 0 ? (
            <EmptyState title="Aucune offre de laboratoire" description="Publiez la première : elle apparaîtra dans l'appli de tous les inscrits." />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR><TH>Laboratoire</TH><TH>Offre</TH><TH>Période</TH><TH className="text-right">Codes</TH><TH className="text-right">Boîtes vendues</TH><TH className="text-right">Pharmacies</TH><TH className="text-right">À facturer</TH><TH /></TR>
                </THead>
                <TBody>
                  {overview.offers.map((offer) => {
                    const running = offer.status === "ACTIVE" && offer.endsAt >= now;
                    return (
                      <TR key={offer.id}>
                        <TD className="font-semibold">{offer.partner?.name ?? "—"}</TD>
                        <TD>
                          <p className="font-semibold">-{offer.discountPercent} % · {offer.rangeLabel}</p>
                          <p className="text-[12.5px] text-text-secondary">{offer.title} · {offer.audience === "ALL" ? "tous" : "abonnés"} · {formatCents(offer.labFeeCents)} / boîte</p>
                        </TD>
                        <TD className="whitespace-nowrap">{day(offer.startsAt)} → {day(offer.endsAt)} {!running && <Badge tone="neutral" className="ml-1">{offer.status === "CANCELED" ? "Arrêtée" : "Terminée"}</Badge>}</TD>
                        <TD className="text-right tabular-nums">{offer.stats.codes}</TD>
                        <TD className="text-right tabular-nums">{offer.stats.redeemed}</TD>
                        <TD className="text-right tabular-nums">{offer.pharmacies}</TD>
                        <TD className="text-right font-semibold tabular-nums">{formatCents(offer.dueCents)}</TD>
                        <TD className="text-right">{running && <CancelOfferButton offerId={offer.id} kind="lab" />}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
