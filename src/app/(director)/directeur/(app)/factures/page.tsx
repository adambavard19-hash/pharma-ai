import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Paperclip, Plus } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { listDirectorInvoices } from "@/server/services/sales/director-money";
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS, isInvoiceStatus, type InvoiceStatus } from "@/core/sales/director/invoice";
import { FilterChips, hrefWith } from "@/components/admin/filters";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/sales/invoice-status-badge";
import { formatCents, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FilterSelects } from "../commissions/_components/filter-selects";
import { Pager } from "../commissions/_components/pager";

export const metadata: Metadata = { title: "Factures" };

const BASE_PATH = "/directeur/factures";

const first = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

/** Les trois totaux du haut : ce qui attend le directeur, puis ce qui est réglé. */
const CARDS: { status: InvoiceStatus; title: string; hint: string }[] = [
  { status: "RECEIVED", title: "À valider", hint: "Reçues, en attente de votre décision" },
  { status: "APPROVED", title: "À payer", hint: "Validées, en attente de paiement" },
  { status: "PAID", title: "Payées", hint: "Déjà réglées" },
];

/**
 * Les factures reçues des commerciaux. Les filtres sont dans l'adresse :
 * `?commercial=` (identifiant), `?statut=` (RECEIVED, APPROVED, PAID,
 * REJECTED), `?page=`. Une facture se valide, se paie ou se refuse depuis sa
 * fiche.
 */
export default async function DirectorInvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDirectorSession();
  const params = await searchParams;

  const salesRepId = (first(params.commercial) ?? "").trim().slice(0, 64) || null;
  const requestedStatus = first(params.statut);
  const status = isInvoiceStatus(requestedStatus) ? requestedStatus : null;
  const requestedPage = Number.parseInt(first(params.page) ?? "1", 10);

  const data = await listDirectorInvoices({ salesRepId, status, page: Number.isFinite(requestedPage) ? requestedPage : 1 });

  const keep = { commercial: salesRepId, statut: status };
  const totalAll = INVOICE_STATUSES.reduce((sum, key) => sum + data.byStatus[key].count, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Factures"
        description="Les factures que les commerciaux vous envoient pour être payés de leurs commissions. Enregistrez-en une, puis validez-la, payez-la ou refusez-la."
        actions={
          <Button asChild size="sm" leadingIcon={<Plus className="size-4" />}>
            <Link href={salesRepId ? `${BASE_PATH}/nouvelle?commercial=${encodeURIComponent(salesRepId)}` : `${BASE_PATH}/nouvelle`}>Enregistrer une facture</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CARDS.map((card) => {
          const total = data.byStatus[card.status];
          const active = status === card.status;
          return (
            <Link
              key={card.status}
              href={hrefWith(BASE_PATH, { commercial: salesRepId }, { statut: active ? null : card.status })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-xl border bg-surface-card p-4 shadow-xs transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                active ? "border-brand-600 ring-1 ring-brand-600" : "border-border-subtle",
              )}
            >
              <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">{card.title}</p>
              <p className="mt-1 text-[22px] leading-none font-semibold tabular text-text-primary">{formatCents(total.cents)}</p>
              <p className="mt-1.5 text-[12px] text-text-secondary">
                {total.count} facture{total.count > 1 ? "s" : ""} · {card.hint}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <FilterChips
          basePath={BASE_PATH}
          param="statut"
          label="Filtrer par statut"
          current={status}
          keep={{ commercial: salesRepId }}
          options={[{ value: null, label: "Toutes", count: totalAll }, ...INVOICE_STATUSES.map((key) => ({ value: key, label: INVOICE_STATUS_LABELS[key], count: data.byStatus[key].count }))]}
        />
        <FilterSelects
          basePath={BASE_PATH}
          current={keep}
          selects={[{ name: "commercial", label: "Commercial", allLabel: "Tous les commerciaux", options: data.reps.map((rep) => ({ value: rep.id, label: rep.isActive ? rep.name : `${rep.name} (inactif)` })) }]}
        />
      </div>

      {data.rows.length === 0 ? (
        <Card>
          {status || salesRepId ? (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="Aucune facture ne correspond"
              description="Aucune facture pour ces filtres. Élargissez la recherche pour en voir davantage."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={BASE_PATH}>Voir toutes les factures</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="Aucune facture pour l'instant"
              description="Quand un commercial vous envoie sa facture, enregistrez-la ici : vous la validez, puis vous la payez."
              action={
                <Button asChild size="sm" leadingIcon={<Plus className="size-4" />}>
                  <Link href={`${BASE_PATH}/nouvelle`}>Enregistrer une facture</Link>
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden">
            {data.rows.map((row) => (
              <li key={row.id}>
                <Link href={`${BASE_PATH}/${row.id}`} className="block space-y-1.5 rounded-xl border border-border-subtle bg-surface-card p-4 transition-colors hover:border-border-default">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-text-primary">Facture {row.number}</p>
                      <p className="truncate text-[12.5px] text-text-tertiary">{row.rep.name}</p>
                    </div>
                    <p className="shrink-0 text-[15px] font-semibold tabular text-text-primary">{formatCents(row.amountCents)}</p>
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-tertiary">
                    <InvoiceStatusBadge status={row.status} />
                    <span>Du {formatDate(row.issuedAt)}</span>
                    {row.periodLabel && <span>· {row.periodLabel}</span>}
                    {row.hasFile && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="size-3" aria-hidden="true" /> PDF joint
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
                  <TH>Facture</TH>
                  <TH>Commercial</TH>
                  <TH>Date</TH>
                  <TH>Période</TH>
                  <TH numeric>Montant</TH>
                  <TH numeric>Commissions</TH>
                  <TH>PDF</TH>
                  <TH>Statut</TH>
                </TR>
              </THead>
              <TBody>
                {data.rows.map((row) => (
                  <TR key={row.id} interactive>
                    <TD>
                      <Link href={`${BASE_PATH}/${row.id}`} className="text-[13px] font-medium text-text-primary hover:underline">
                        {row.number}
                      </Link>
                    </TD>
                    <TD className="max-w-[200px] truncate text-[13px]">{row.rep.name}</TD>
                    <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">{formatDate(row.issuedAt)}</TD>
                    <TD className="max-w-[160px] truncate text-[12.5px] text-text-secondary">{row.periodLabel ?? "—"}</TD>
                    <TD numeric className="font-semibold whitespace-nowrap">
                      {formatCents(row.amountCents)}
                    </TD>
                    <TD numeric className="text-text-secondary">
                      {row.commissionCount}
                    </TD>
                    <TD className="text-[12.5px] text-text-secondary">{row.hasFile ? "Oui" : "—"}</TD>
                    <TD>
                      <InvoiceStatusBadge status={row.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>

          <Pager basePath={BASE_PATH} keep={keep} page={data.page} pageCount={data.pageCount} total={data.filteredTotal} noun="facture" />
        </>
      )}
    </div>
  );
}
