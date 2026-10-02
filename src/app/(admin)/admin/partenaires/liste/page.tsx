import type { Metadata } from "next";
import Link from "next/link";
import { Handshake } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listPartners, type PartnerListRow } from "@/server/services/partners/partners";
import { CONTRACT_TYPE_LABELS, INTEGRATION_MODE_LABELS } from "@/core/partners/status";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { PublicationBadge } from "./_components/publication-badge";
import { NewPartnerButton } from "./new-partner-button";

export const metadata: Metadata = { title: "Partenaires" };

function contractLine(row: PartnerListRow): string {
  if (row.currentContract) return CONTRACT_TYPE_LABELS[row.currentContract];
  return row.contracts > 0 ? "Aucun en cours" : "—";
}

function integrationLine(row: PartnerListRow): string {
  if (!row.integration) return "—";
  const label = INTEGRATION_MODE_LABELS[row.integration.mode];
  return row.integration.isActive ? label : `${label} (inactive)`;
}

/**
 * Les partenaires de PharmaBoost : laboratoires et sociétés, créés depuis une
 * candidature acceptée ou à la main. Un partenaire naît en brouillon et ne
 * devient visible des officines qu'à sa publication.
 */
export default async function PartnersListPage() {
  await requirePlatformSession();
  const rows = await listPartners();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Partenaires"
        description="Les laboratoires et sociétés partenaires, leur statut de publication, leurs marques, leur contrat en cours et leur mode d'intégration."
        actions={<NewPartnerButton />}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Handshake className="size-5" />}
            title="Aucun partenaire"
            description="Un partenaire se crée depuis une candidature acceptée, ou à la main avec « Nouveau partenaire ». Il naît en brouillon, invisible des officines."
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/admin/partenaires/liste/${row.id}`} className="block space-y-1.5 rounded-xl border border-border-subtle bg-surface-card p-4 transition-colors hover:border-border-default">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-text-primary">{row.name}</p>
                      {row.legalName && row.legalName !== row.name && <p className="truncate text-[12.5px] text-text-tertiary">{row.legalName}</p>}
                    </div>
                    <PublicationBadge status={row.status} />
                  </div>
                  <p className="text-[12.5px] text-text-secondary">
                    {row.brands} marque{row.brands > 1 ? "s" : ""} · contrat : {contractLine(row)} · intégration : {integrationLine(row)}
                  </p>
                  <p className="text-[12px] text-text-tertiary">Créé le {formatDate(row.createdAt)}</p>
                </Link>
              </li>
            ))}
          </ul>

          <TableWrapper className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Partenaire</TH>
                  <TH>Publication</TH>
                  <TH numeric>Marques</TH>
                  <TH>Contrat en cours</TH>
                  <TH>Intégration</TH>
                  <TH>Créé le</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id} interactive>
                    <TD className="max-w-[280px]">
                      <Link href={`/admin/partenaires/liste/${row.id}`} className="block truncate text-[13px] font-medium text-text-primary hover:underline">
                        {row.name}
                      </Link>
                      {row.legalName && row.legalName !== row.name && <span className="block truncate text-[12px] text-text-tertiary">{row.legalName}</span>}
                    </TD>
                    <TD>
                      <PublicationBadge status={row.status} />
                    </TD>
                    <TD numeric>{row.brands}</TD>
                    <TD className="text-[13px] text-text-secondary">{contractLine(row)}</TD>
                    <TD className="text-[13px] text-text-secondary">{integrationLine(row)}</TD>
                    <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">{formatDate(row.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </>
      )}
    </div>
  );
}
