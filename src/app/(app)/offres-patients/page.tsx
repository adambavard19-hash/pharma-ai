import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";
import { BadgePercent, Crown, Smartphone } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getPharmacyOffersOverview } from "@/server/services/patient-offers";
import { PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { OfferForm } from "@/components/patient-offers/offer-form";
import { CancelOfferButton } from "@/components/patient-offers/cancel-offer-button";

export const metadata: Metadata = { title: "Offres patients" };

const day = (date: Date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/**
 * Les offres de la pharmacie dans l'appli PharmaBoost (fondateur, 22 oct. 2026) : le titulaire publie une remise sur une
 * gamme (nouvelle gamme, vente privée), réservée aux abonnés PharmaBoost+ ou ouverte à tous ; ses patients la montrent au
 * comptoir, la douchette bipe leur code. L'équipe lit (NEWS_VIEW) ; publier et arrêter restent au titulaire (NEWS_MANAGE).
 */
export default async function PatientOffersPage() {
  if (!PATIENT_APP_LIVE) notFound();
  const session = await requirePermission(PERMISSIONS.NEWS_VIEW);
  const canManage = session.permissions.has(PERMISSIONS.NEWS_MANAGE);
  const overview = await getPharmacyOffersOverview(session.scope);
  const now = new Date();
  const live = overview.offers.filter((offer) => offer.status === "ACTIVE" && offer.endsAt >= now);
  const redeemed = overview.offers.reduce((sum, offer) => sum + offer.stats.redeemed, 0);
  return (
    <div className="space-y-6">
      <PageHeader title="Offres patients" description="Vos remises dans l'appli PharmaBoost : vos patients abonnés reviennent chez vous pour en profiter." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Patients inscrits chez vous" value={overview.members.total} icon={<Smartphone className="size-4" />} sublabel="ont choisi votre pharmacie dans l'appli" />
        <StatCard label="Abonnés PharmaBoost+" value={overview.members.plus} icon={<Crown className="size-4" />} sublabel="voient toutes vos offres" />
        <StatCard label="Offres utilisées au comptoir" value={redeemed} icon={<BadgePercent className="size-4" />} sublabel={`${live.length} offre${live.length > 1 ? "s" : ""} en cours`} />
      </div>
      {canManage && <OfferForm kind="pharmacy" />}
      <Card>
        <CardHeader title="Vos offres" />
        <CardContent>
          {overview.offers.length === 0 ? (
            <EmptyState title="Aucune offre pour l'instant" description="Publiez votre première offre : une nouvelle gamme, une vente privée pour vos abonnés." />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR><TH>Offre</TH><TH>Pour qui</TH><TH>Période</TH><TH className="text-right">Codes obtenus</TH><TH className="text-right">Utilisées</TH><TH /></TR>
                </THead>
                <TBody>
                  {overview.offers.map((offer) => {
                    const running = offer.status === "ACTIVE" && offer.endsAt >= now;
                    return (
                      <TR key={offer.id}>
                        <TD>
                          <p className="font-semibold">-{offer.discountPercent} % · {offer.rangeLabel}</p>
                          <p className="text-[12.5px] text-text-secondary">{offer.title}</p>
                        </TD>
                        <TD>{offer.audience === "ALL" ? <Badge tone="info">Tous</Badge> : <Badge tone="accent">Abonnés</Badge>}</TD>
                        <TD className="whitespace-nowrap">{day(offer.startsAt)} → {day(offer.endsAt)} {!running && <Badge tone="neutral" className="ml-1">{offer.status === "CANCELED" ? "Arrêtée" : "Terminée"}</Badge>}</TD>
                        <TD className="text-right tabular-nums">{offer.stats.codes}</TD>
                        <TD className="text-right font-semibold tabular-nums">{offer.stats.redeemed}</TD>
                        <TD className="text-right">{canManage && running && <CancelOfferButton offerId={offer.id} kind="pharmacy" />}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>
      {overview.labOffers.length > 0 && (
        <Card>
          <CardHeader title="Offres des laboratoires" description="Valables aussi chez vous. La remise vous est remboursée par le laboratoire." />
          <CardContent>
            <ul className="divide-y divide-border">
              {overview.labOffers.map((offer) => (
                <li key={offer.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="font-semibold">-{offer.discountPercent} % · {offer.rangeLabel}</span>
                    <span className="block text-[12.5px] text-text-secondary">{offer.partnerName ?? "Laboratoire"} · jusqu&apos;au {day(offer.endsAt)}</span>
                  </span>
                  <span className="text-right text-[13px] tabular-nums">{offer.redeemedHere} utilisée{offer.redeemedHere > 1 ? "s" : ""} chez vous</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
