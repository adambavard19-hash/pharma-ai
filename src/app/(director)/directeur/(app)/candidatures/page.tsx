import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Inbox, UserCheck } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { listSalesApplications } from "@/server/services/sales-applications/admin";
import { SALES_APPLICATION_STATUSES, SALES_APPLICATION_STATUS_LABELS } from "@/core/sales-applications/status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FilterChips, SearchBox, hrefWith } from "@/components/admin/filters";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { SalesApplicationStatusBadge, statusFromParam, statusParam } from "@/app/(admin)/admin/candidatures-commerciales/_components/status";

export const metadata: Metadata = { title: "Candidatures" };

const BASE_PATH = "/directeur/candidatures";

const first = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

/**
 * Les candidatures déposées sur la page « Devenir commercial » du site, de la
 * plus récente à la plus ancienne, comme dans la console : filtre par statut
 * (`?statut=`), recherche par nom, e-mail ou ville (`?q=`), pagination
 * (`?page=`). Aucune ne devient un commercial toute seule : chacune avance à la
 * main, depuis sa fiche, par le directeur.
 */
export default async function SalesApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDirectorSession();
  const params = await searchParams;
  const status = statusFromParam(first(params.statut));
  const q = (first(params.q) ?? "").trim().slice(0, 80);
  const requestedPage = Number.parseInt(first(params.page) ?? "1", 10);
  const { rows, counts, total, grandTotal, filteredTotal, page, pageCount } = await listSalesApplications({ status, q, page: Number.isFinite(requestedPage) ? requestedPage : 1 });

  const keep = { statut: status ? statusParam(status) : null, q: q || null };
  const pageHref = (target: number) => hrefWith(BASE_PATH, keep, { page: target > 1 ? String(target) : null });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Candidatures"
        description="Les personnes qui ont demandé à rejoindre l'équipe commerciale depuis le site. Chaque candidature avance à la main ; un commercial n'est créé que lorsque vous le décidez, depuis une candidature acceptée."
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterChips
          basePath={BASE_PATH}
          param="statut"
          label="Filtrer par statut"
          current={status ? statusParam(status) : null}
          keep={{ q: q || null }}
          options={[{ value: null, label: "Toutes", count: total }, ...SALES_APPLICATION_STATUSES.map((value) => ({ value: statusParam(value), label: SALES_APPLICATION_STATUS_LABELS[value], count: counts[value] }))]}
        />
        <SearchBox action={BASE_PATH} defaultValue={q} placeholder="Nom, e-mail ou ville" keep={{ statut: status ? statusParam(status) : null }} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-card">
          {grandTotal === 0 ? (
            <EmptyState icon={<Inbox className="size-5" />} title="Aucune candidature reçue" description="Les candidatures envoyées depuis la page « Devenir commercial » du site apparaîtront ici." />
          ) : (
            <EmptyState
              icon={<Inbox className="size-5" />}
              title="Aucune candidature ne correspond"
              description={q ? `Rien ne correspond à « ${q} »${status ? ` parmi les candidatures « ${SALES_APPLICATION_STATUS_LABELS[status]} »` : ""}.` : `Aucune candidature n'a le statut « ${status ? SALES_APPLICATION_STATUS_LABELS[status] : ""} » pour l'instant.`}
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={BASE_PATH}>Voir toutes les candidatures</Link>
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`${BASE_PATH}/${row.id}`} className="block space-y-1.5 rounded-xl border border-border-subtle bg-surface-card p-4 transition-colors hover:border-border-default">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-text-primary">
                        {row.firstName} {row.lastName}
                      </p>
                      <p className="truncate text-[12.5px] text-text-tertiary">{row.email}</p>
                    </div>
                    <SalesApplicationStatusBadge status={row.status} />
                  </div>
                  <p className="truncate text-[12.5px] text-text-secondary">
                    {row.city} · zone souhaitée : {row.zone}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-text-tertiary">
                    <span>Reçue le {formatDate(row.createdAt)}</span>
                    {row.hasCv && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="size-3" aria-hidden="true" /> CV joint
                      </span>
                    )}
                    {row.converted && (
                      <span className="inline-flex items-center gap-1">
                        <UserCheck className="size-3" aria-hidden="true" /> Commercial créé
                      </span>
                    )}
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
                  <TH>Candidat</TH>
                  <TH>Ville ou secteur</TH>
                  <TH>Zone souhaitée</TH>
                  <TH>CV</TH>
                  <TH>Statut</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id} interactive>
                    <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">{formatDate(row.createdAt)}</TD>
                    <TD className="max-w-[260px]">
                      <Link href={`${BASE_PATH}/${row.id}`} className="block truncate text-[13px] font-medium text-text-primary hover:underline">
                        {row.firstName} {row.lastName}
                      </Link>
                      <span className="block truncate text-[12px] text-text-tertiary">{row.email}</span>
                    </TD>
                    <TD className="max-w-[180px] truncate text-[13px]">{row.city}</TD>
                    <TD className="max-w-[200px] truncate text-[13px]">{row.zone}</TD>
                    <TD className="text-[12.5px] text-text-secondary">{row.hasCv ? "Oui" : "—"}</TD>
                    <TD>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <SalesApplicationStatusBadge status={row.status} />
                        {row.converted && <span className="text-[11.5px] text-text-tertiary">commercial créé</span>}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>

          {pageCount > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
              <p className="text-[12.5px] text-text-tertiary">
                Page {page} sur {pageCount} · {filteredTotal} candidature{filteredTotal > 1 ? "s" : ""}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Button asChild variant="outline" size="sm" leadingIcon={<ChevronLeft className="size-4" />}>
                    <Link href={pageHref(page - 1)}>Précédentes</Link>
                  </Button>
                ) : null}
                {page < pageCount ? (
                  <Button asChild variant="outline" size="sm" trailingIcon={<ChevronRight className="size-4" />}>
                    <Link href={pageHref(page + 1)}>Suivantes</Link>
                  </Button>
                ) : null}
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
