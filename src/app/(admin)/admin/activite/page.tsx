import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Building2, CheckCircle2, Clock3, Cpu, Users } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadClientActivity } from "@/server/services/admin/clients";
import { AdminPageHeader } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { FilterChips } from "@/components/admin/filters";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatEuros } from "@/core/billing/subscription";
import { activityLabel, INACTIVE_AFTER_DAYS, searchParam } from "@/core/admin/clients";
import { formatNumber } from "@/lib/format";
import { Stack, When } from "../pharmacies/client-ui";

export const metadata: Metadata = { title: "Activité des officines" };

/**
 * L'usage réel des officines clientes (hors démonstration) : connexions de
 * l'équipe, connecteur, synchronisation du stock, appels IA sur 30 jours.
 * Des volumes et des dates, jamais un contenu.
 */
export default async function ClientActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const filtre = searchParam(params, "filtre") === "inactives" ? "inactives" : null;
  const now = new Date();
  const { rows: all, totals } = await loadClientActivity(now);
  const rows = filtre ? all.filter((r) => r.inactive) : all;

  return (
    <>
      <AdminPageHeader
        space={{ label: "Clients", href: "/admin/pharmacies" }}
        title="Activité"
        description={`Qui utilise PharmaBoost, et qui décroche. Une officine est inactive quand aucun compte ne s'est connecté depuis ${INACTIVE_AFTER_DAYS} jours.`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Officines actives" value={totals.pharmacies} hint="Hors démonstration et suspendues" href="/admin/pharmacies?statut=actives" icon={<Building2 className="size-4" />} />
        <KpiTile label={`Inactives depuis ${INACTIVE_AFTER_DAYS} jours`} value={totals.inactive} hint="Aucune connexion de l'équipe" href="/admin/activite?filtre=inactives" tone={totals.inactive > 0 ? "warning" : "default"} icon={<Clock3 className="size-4" />} />
        <KpiTile label="Comptes connectés sur 7 jours" value={totals.active7} hint={`sur ${totals.accounts} compte${totals.accounts > 1 ? "s" : ""} actif${totals.accounts > 1 ? "s" : ""}`} href="/admin/utilisateurs" icon={<Users className="size-4" />} />
        <KpiTile label="Appels IA sur 30 jours" value={formatNumber(totals.aiCalls30)} hint={totals.aiCalls30 > 0 ? `Coût enregistré : ${formatEuros(totals.aiCostCents30)}` : "Aucun appel enregistré"} href="/admin/technique" icon={<Cpu className="size-4" />} />
      </div>

      <FilterChips
        label="Filtrer l'activité"
        basePath="/admin/activite"
        param="filtre"
        current={filtre}
        options={[
          { value: null, label: "Toutes", count: all.length },
          { value: "inactives", label: "Inactives", count: totals.inactive },
        ]}
      />

      {all.length === 0 ? (
        <Card>
          <EmptyState icon={<Activity className="size-5" />} title="Aucune officine cliente pour l'instant" description="L'activité s'affiche dès qu'une officine est créée (les officines de démonstration sont exclues)." />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<CheckCircle2 className="size-5" />} title="Aucune officine inactive" description={`Toutes les équipes se sont connectées ces ${INACTIVE_AFTER_DAYS} derniers jours.`} />
        </Card>
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Officine</TH>
                <TH>Dernière connexion</TH>
                <TH numeric>Actifs 7 j</TH>
                <TH numeric>Actifs 30 j</TH>
                <TH>Connecteur</TH>
                <TH>Synchro du stock</TH>
                <TH numeric>IA sur 30 jours</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id} interactive>
                  <TD>
                    <Link href={`/admin/pharmacies/${row.id}`} className="block font-medium text-text-primary hover:underline">
                      {row.name}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-text-tertiary">
                      {row.city ?? "Ville non renseignée"}
                      {!row.isActive && <Badge tone="danger">Suspendue</Badge>}
                    </span>
                  </TD>
                  <TD>
                    <When date={row.teamLastLoginAt} empty="Jamais" className="block text-[13px]" />
                    {row.isActive && (
                      <span className="mt-1 block">
                        <StatusBadge status={activityLabel(row.teamLastLoginAt, now)} />
                      </span>
                    )}
                  </TD>
                  <TD numeric>
                    <Stack primary={row.active7} secondary={`sur ${row.accounts}`} />
                  </TD>
                  <TD numeric>
                    <Stack primary={row.active30} secondary={`sur ${row.accounts}`} />
                  </TD>
                  <TD>
                    <StatusBadge status={row.connector} />
                    {row.connector.state !== "NONE" && (
                      <span className="mt-1 block text-[12px] text-text-tertiary">
                        Vu <When date={row.connector.lastSeenAt} empty="jamais" />
                      </span>
                    )}
                  </TD>
                  <TD>
                    <When date={row.stockSyncedAt} empty="Jamais importé" className="text-[13px]" />
                  </TD>
                  <TD numeric>
                    <Stack primary={formatNumber(row.aiCalls30)} secondary={row.aiCalls30 > 0 ? `${formatEuros(row.aiCostCents30)}${row.aiFailed30 > 0 ? ` · ${row.aiFailed30} échec${row.aiFailed30 > 1 ? "s" : ""}` : ""}` : undefined} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}
      <p className="text-[12.5px] text-text-tertiary">Classées de la plus récemment active à la moins active. Les officines de démonstration ne sont pas comptées.</p>
    </>
  );
}
