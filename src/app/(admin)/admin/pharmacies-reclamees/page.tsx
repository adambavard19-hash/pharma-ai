import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";
import { Crown, MapPin, Store, Users } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listClaimedPharmacies } from "@/server/services/patient-offers";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { MarkClaimedButton } from "./mark-claimed-button";

export const metadata: Metadata = { title: "Pharmacies réclamées" };

const day = (date: Date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/**
 * Les pharmacies hors réseau que les inscrits de l'appli déclarent comme la leur (fondateur, 22 oct. 2026) : « 47 de vos
 * patients utilisent déjà PharmaBoost et vous réclament » — l'argument du commercial. Les plus réclamées d'abord.
 */
export default async function ClaimedPharmaciesPage() {
  if (!PATIENT_APP_LIVE) notFound();
  await requirePlatformSession();
  const rows = await listClaimedPharmacies();
  const wanting = rows.reduce((sum, row) => sum + row.wanting, 0);
  return (
    <div className="space-y-6">
      <AdminPageHeader space={{ label: "Commercial" }} title="Pharmacies réclamées" description="Les pharmacies que les patients de l'appli veulent voir rejoindre PharmaBoost : à appeler en premier." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pharmacies réclamées" value={rows.filter((row) => row.wanting > 0).length} icon={<Store className="size-4" />} />
        <StatCard label="Patients qui les réclament" value={wanting} icon={<Users className="size-4" />} />
        <StatCard label="Dont abonnés PharmaBoost+" value={rows.reduce((sum, row) => sum + row.plus, 0)} icon={<Crown className="size-4" />} />
      </div>
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title="Aucune pharmacie réclamée pour l'instant" description="Dès qu'un patient de l'appli déclare une pharmacie hors réseau, elle apparaît ici." />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR><TH>Pharmacie</TH><TH className="text-right">La réclament</TH><TH className="text-right">L&apos;ont déclarée</TH><TH className="text-right">Abonnés</TH><TH>Dernière demande</TH><TH>Suite</TH></TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.key} data-pharmacie-reclamee={row.key}>
                      <TD>
                        <p className="font-semibold">{row.pharmacyName}</p>
                        <p className="flex items-center gap-1 text-[12.5px] text-text-secondary"><MapPin className="size-3" aria-hidden="true" /> {row.postalCode} {row.city}</p>
                      </TD>
                      <TD className="text-right text-[15px] font-bold tabular-nums">{row.wanting}</TD>
                      <TD className="text-right tabular-nums">{row.declared}</TD>
                      <TD className="text-right tabular-nums">{row.plus}</TD>
                      <TD className="whitespace-nowrap">{day(row.lastAt)}</TD>
                      <TD>{row.handledAt ? <Badge tone="success">{row.handledNote ?? "Contactée"} · {day(row.handledAt)}</Badge> : <MarkClaimedButton claimKey={row.key} />}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
