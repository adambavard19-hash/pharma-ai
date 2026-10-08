import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, ShieldCheck } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { CANCELLATION_FILTERS, cancellationCandidates, cancellationFilterStatuses, countCancellationFilters, listCancellations, matchesQuery } from "@/server/services/admin/billing-admin";
import { CANCELLATION_CHANNELS, CANCELLATION_REASONS } from "@/core/admin/statuses";
import { formatFrenchDate } from "@/core/billing/subscription";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { FilterChips, SearchBox } from "@/components/admin/filters";
import { CancellationStatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from "@/components/ui/table";
import { DateText, RowLink, readParam } from "../abonnements/billing-ui";
import { CreateCancellationButton } from "./create-cancellation";

export const metadata: Metadata = { title: "Résiliations" };

/**
 * Les demandes de résiliation : reçues, en traitement, confirmées, annulées
 * ou terminées. Chaque étape est un geste confirmé et tracé ; rien n'est
 * jamais coupé ni supprimé automatiquement.
 */
export default async function CancellationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const statut = readParam(params, "statut");
  const q = readParam(params, "q");
  const statuses = cancellationFilterStatuses(statut);
  const activeStatut = statuses ? statut : null;

  const [{ rows, statuses: allStatuses }, candidates] = await Promise.all([listCancellations({ statuses }), cancellationCandidates()]);
  const counts = countCancellationFilters(allStatuses);
  const visible = rows.filter((r) => matchesQuery(q, [r.pharmacy.name, r.pharmacy.city, r.subscription?.plan.name, CANCELLATION_REASONS[r.reason], r.reasonDetail]));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Finances", href: "/admin/abonnements" }}
        title="Résiliations"
        description="Les demandes de résiliation, de la réception à la fin. Chaque étape est confirmée, tracée, et ne coupe rien d'elle-même."
        actions={<CreateCancellationButton pharmacies={candidates} variant="primary" />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Ouvertes" value={counts.ouvertes} href="/admin/resiliations?statut=ouvertes" tone={counts.ouvertes > 0 ? "warning" : "default"} hint="Reçues, en traitement ou confirmées" />
        <KpiTile label="Reçues, à traiter" value={counts.recues} href="/admin/resiliations?statut=recues" tone={counts.recues > 0 ? "warning" : "default"} />
        <KpiTile label="Confirmées" value={counts.confirmees} href="/admin/resiliations?statut=confirmees" hint="Fin à mener à terme" />
        <KpiTile label="Annulées par le client" value={counts.annulees} href="/admin/resiliations?statut=annulees" tone={counts.annulees > 0 ? "success" : "default"} hint="Clients conservés" />
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface-card px-4 py-3 text-[13px] leading-5 text-text-secondary">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden="true" />
        <p>
          Une résiliation terminée ne coupe rien automatiquement et ne supprime aucune donnée. La fin chez Stripe et la suspension de l&apos;accès sont des gestes séparés, faits depuis la demande ou la fiche abonnement.
        </p>
      </div>

      <AdminSection padded={false}>
        <div className="flex flex-col gap-3 border-b border-border-subtle p-4 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            basePath="/admin/resiliations"
            param="statut"
            current={activeStatut}
            keep={{ q }}
            label="Filtrer par statut"
            options={[{ value: null, label: "Toutes", count: allStatuses.length }, ...CANCELLATION_FILTERS.map((f) => ({ value: f.key, label: f.label, count: counts[f.key] }))]}
          />
          <SearchBox action="/admin/resiliations" defaultValue={q} placeholder="Officine, ville, motif…" keep={{ statut: activeStatut }} />
        </div>
        {visible.length === 0 ? (
          <EmptyState
            icon={<Ban className="size-6" />}
            title={allStatuses.length === 0 ? "Aucune demande de résiliation pour l'instant" : "Aucune demande ne correspond"}
            description={allStatuses.length === 0 ? "Quand un titulaire demande à résilier, enregistrez sa demande ici pour la suivre jusqu'au bout." : "Changez de filtre ou de recherche."}
            action={allStatuses.length === 0 ? <CreateCancellationButton pharmacies={candidates} /> : <Button asChild size="sm" variant="outline"><Link href="/admin/resiliations">Tout afficher</Link></Button>}
          />
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <TR>
                  <TH>Officine</TH>
                  <TH>Offre</TH>
                  <TH>Demande</TH>
                  <TH>Motif</TH>
                  <TH>Fin prévue</TH>
                  <TH>Statut</TH>
                  <TH>Dernier contact</TH>
                  <TH className="w-10"><span className="sr-only">Ouvrir</span></TH>
                </TR>
              </THead>
              <TBody>
                {visible.map((r) => {
                  const suggested = !r.plannedEndAt && r.subscription?.currentPeriodEnd && r.status !== "CANCELED" && r.status !== "COMPLETED" ? r.subscription.currentPeriodEnd : null;
                  return (
                    <TR key={r.id} interactive>
                      <TD>
                        <RowLink href={`/admin/resiliations/${r.id}`}>{r.pharmacy.name}</RowLink>
                        <p className="text-[12px] text-text-tertiary">{r.pharmacy.city ?? "—"}</p>
                      </TD>
                      <TD>{r.subscription?.plan.name ?? <span className="text-text-tertiary">Sans abonnement</span>}</TD>
                      <TD>
                        <DateText date={r.requestedAt} />
                        <p className="text-[12px] text-text-tertiary">{CANCELLATION_CHANNELS[r.channel] ?? r.channel}</p>
                      </TD>
                      <TD className="max-w-[16rem]">
                        <span className="block truncate">{CANCELLATION_REASONS[r.reason] ?? r.reason}</span>
                        {r.reasonDetail && <span className="block truncate text-[12px] text-text-tertiary">{r.reasonDetail}</span>}
                      </TD>
                      <TD>
                        {r.plannedEndAt ? <DateText date={r.plannedEndAt} /> : suggested ? <span className="text-[12.5px] text-text-tertiary">suggérée : {formatFrenchDate(suggested)}</span> : <span className="text-text-tertiary">—</span>}
                        {r.stripeScheduled && <p className="mt-0.5"><Badge tone="info">Programmée chez Stripe</Badge></p>}
                      </TD>
                      <TD><CancellationStatusBadge status={r.status} /></TD>
                      <TD><DateText date={r.lastContactAt} fallback="Aucun" /></TD>
                      <TD>
                        <Link href={`/admin/resiliations/${r.id}`} className="flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary" aria-label={`Ouvrir la demande de ${r.pharmacy.name}`}>
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </AdminSection>
    </div>
  );
}
