import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listApplications } from "@/server/services/partners/applications";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/core/partners/status";
import { universeLabel } from "@/config/universes";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApplicationStatusBadge, statusParam } from "./_components/status-badge";

export const metadata: Metadata = { title: "Candidatures partenaires" };

function universesLine(keys: string[]): string {
  if (keys.length === 0) return "—";
  const labels = keys.map((key) => universeLabel(key));
  return labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(", ");
}

/**
 * Les candidatures déposées par les laboratoires sur le site public, de la
 * plus récente à la plus ancienne, filtrables par statut. Aucune n'est
 * activée automatiquement : chacune avance à la main, depuis sa fiche.
 */
export default async function PartnerApplicationsPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  await requirePlatformSession();
  const { statut } = await searchParams;
  const status: ApplicationStatus | null = APPLICATION_STATUSES.find((value) => statusParam(value) === statut) ?? null;
  const { rows, counts, total } = await listApplications(status);

  const pill = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-[12.5px] font-medium whitespace-nowrap transition-colors",
      active ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300" : "border-border-default text-text-secondary hover:text-text-primary",
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Candidatures"
        description="Les laboratoires et marques qui ont demandé à rejoindre PharmaBoost Partenaires depuis le site. Chaque candidature avance à la main ; rien n'est publié aux officines sans une décision explicite."
      />

      <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-1.5">
        <Link href="/admin/partenaires/candidatures" className={pill(status === null)}>
          Toutes ({total})
        </Link>
        {APPLICATION_STATUSES.map((value) => (
          <Link key={value} href={`/admin/partenaires/candidatures?statut=${statusParam(value)}`} className={pill(status === value)}>
            {APPLICATION_STATUS_LABELS[value]} ({counts[value]})
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox className="size-5" />}
            title={status ? `Aucune candidature « ${APPLICATION_STATUS_LABELS[status]} »` : "Aucune candidature reçue"}
            description={status ? "Aucune candidature n'a ce statut pour l'instant." : "Les candidatures déposées par les laboratoires sur le site public apparaîtront ici."}
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/admin/partenaires/candidatures/${row.id}`} className="block space-y-1.5 rounded-xl border border-border-subtle bg-surface-card p-4 transition-colors hover:border-border-default">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-text-primary">{row.brand}</p>
                      <p className="truncate text-[12.5px] text-text-tertiary">{row.company}</p>
                    </div>
                    <ApplicationStatusBadge status={row.status} />
                  </div>
                  <p className="truncate text-[12.5px] text-text-secondary">
                    {row.contactName} · {row.email}
                  </p>
                  <p className="text-[12px] text-text-tertiary">
                    Reçue le {formatDate(row.createdAt)} · {universesLine(row.universes)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <TableWrapper className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Reçue le</TH>
                  <TH>Société</TH>
                  <TH>Marque</TH>
                  <TH>Contact</TH>
                  <TH>Univers</TH>
                  <TH>Statut</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id} interactive>
                    <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">{formatDate(row.createdAt)}</TD>
                    <TD className="max-w-[220px]">
                      <Link href={`/admin/partenaires/candidatures/${row.id}`} className="block truncate text-[13px] font-medium text-text-primary hover:underline">
                        {row.company}
                      </Link>
                    </TD>
                    <TD className="max-w-[200px] truncate text-[13px]">{row.brand}</TD>
                    <TD className="max-w-[240px]">
                      <span className="block truncate text-[13px] text-text-primary">{row.contactName}</span>
                      <span className="block truncate text-[12px] text-text-tertiary">{row.email}</span>
                    </TD>
                    <TD className="max-w-[220px] truncate text-[12.5px] text-text-secondary">{universesLine(row.universes)}</TD>
                    <TD>
                      <ApplicationStatusBadge status={row.status} />
                    </TD>
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
