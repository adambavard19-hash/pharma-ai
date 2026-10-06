import type { Metadata } from "next";
import Link from "next/link";
import { Coins } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { listDirectorCommissions } from "@/server/services/sales/director-money";
import { COMMISSION_STATUS_LABELS, type CommissionStatusCode } from "@/core/sales/pipeline";
import { COMMISSION_STATUSES, isCommissionStatus, monthLabel, parseMonthParam, recentMonths } from "@/core/sales/director/money";
import { FilterChips, hrefWith } from "@/components/admin/filters";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CommissionStatusBadge } from "@/components/sales/status-badge";
import { InvoiceStatusBadge } from "@/components/sales/invoice-status-badge";
import { formatCents, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CommissionActions } from "./_components/commission-actions";
import { FilterSelects } from "./_components/filter-selects";
import { Pager } from "./_components/pager";

export const metadata: Metadata = { title: "Commissions" };

const BASE_PATH = "/directeur/commissions";

const first = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

/** Une phrase sous chaque total : ce que le statut veut dire pour le directeur. */
const CARD_HINTS: Record<CommissionStatusCode, string> = {
  FORECAST: "Contrat pas encore finalisé",
  EARNED: "À valider",
  PAYABLE: "Validées, à payer",
  PAID: "Déjà réglées",
  CANCELLED: "Écartées",
};

const CARD_TITLES: Record<CommissionStatusCode, string> = {
  FORECAST: "Prévisionnelles",
  EARNED: "Acquises",
  PAYABLE: "À payer",
  PAID: "Payées",
  CANCELLED: "Annulées",
};

/**
 * Toutes les commissions de l'équipe. Les filtres sont dans l'adresse :
 * `?commercial=` (identifiant), `?statut=` (FORECAST, EARNED, PAYABLE, PAID,
 * CANCELLED), `?mois=` (AAAA-MM, mois de création), `?page=`. Valider, payer et
 * annuler se font ici ; une commission réclamée par une facture se règle par la
 * facture.
 */
export default async function DirectorCommissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDirectorSession();
  const params = await searchParams;

  const salesRepId = (first(params.commercial) ?? "").trim().slice(0, 64) || null;
  const requestedStatus = first(params.statut);
  const status = isCommissionStatus(requestedStatus) ? requestedStatus : null;
  const month = parseMonthParam(first(params.mois));
  const requestedPage = Number.parseInt(first(params.page) ?? "1", 10);

  const data = await listDirectorCommissions({ salesRepId, status, month, page: Number.isFinite(requestedPage) ? requestedPage : 1 });

  const keep = { commercial: salesRepId, statut: status, mois: month };
  const totalAll = COMMISSION_STATUSES.reduce((sum, key) => sum + data.byStatus[key].count, 0);
  const filtered = !!(salesRepId || month || status);
  const months = recentMonths(new Date());
  if (month && !months.includes(month)) months.push(month);
  const repName = salesRepId ? (data.reps.find((rep) => rep.id === salesRepId)?.name ?? null) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Commissions"
        description="Ce que l'équipe a gagné, et ce qu'il reste à valider ou à payer. Une commission réclamée par une facture se règle par la facture."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/directeur/factures">Voir les factures</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {COMMISSION_STATUSES.map((key) => {
          const total = data.byStatus[key];
          const active = status === key;
          return (
            <Link
              key={key}
              href={hrefWith(BASE_PATH, { commercial: salesRepId, mois: month }, { statut: active ? null : key })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-xl border bg-surface-card p-4 shadow-xs transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                active ? "border-brand-600 ring-1 ring-brand-600" : "border-border-subtle",
              )}
            >
              <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">{CARD_TITLES[key]}</p>
              <p className="mt-1 text-[22px] leading-none font-semibold tabular text-text-primary">{formatCents(total.cents)}</p>
              <p className="mt-1.5 text-[12px] text-text-secondary">
                {total.count} commission{total.count > 1 ? "s" : ""} · {CARD_HINTS[key]}
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
          keep={{ commercial: salesRepId, mois: month }}
          options={[{ value: null, label: "Toutes", count: totalAll }, ...COMMISSION_STATUSES.map((key) => ({ value: key, label: COMMISSION_STATUS_LABELS[key], count: data.byStatus[key].count }))]}
        />
        <FilterSelects
          basePath={BASE_PATH}
          current={keep}
          selects={[
            { name: "commercial", label: "Commercial", allLabel: "Tous les commerciaux", options: data.reps.map((rep) => ({ value: rep.id, label: rep.isActive ? rep.name : `${rep.name} (inactif)` })) },
            { name: "mois", label: "Mois", allLabel: "Tous les mois", options: months.map((value) => ({ value, label: monthLabel(value) })) },
          ]}
        />
        {month && <p className="text-[12.5px] text-text-tertiary">Le mois est celui où la commission a été créée.</p>}
      </div>

      {!salesRepId && data.byRep.length > 0 && (
        <section aria-labelledby="par-commercial" className="overflow-hidden rounded-xl border border-border-subtle bg-surface-card">
          <h2 id="par-commercial" className="border-b border-border-subtle px-4 py-3 text-[14px] font-semibold text-text-primary">
            Par commercial
          </h2>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Commercial</TH>
                  <TH numeric>À valider</TH>
                  <TH numeric>À payer</TH>
                  <TH numeric>Payées</TH>
                  <TH numeric>Total</TH>
                </TR>
              </THead>
              <TBody>
                {data.byRep.map((rep) => (
                  <TR key={rep.salesRepId} interactive>
                    <TD>
                      <Link href={hrefWith(BASE_PATH, { statut: status, mois: month }, { commercial: rep.salesRepId })} className="text-[13px] font-medium text-text-primary hover:underline">
                        {rep.name}
                      </Link>
                    </TD>
                    <TD numeric>{formatCents(rep.earnedCents)}</TD>
                    <TD numeric>{formatCents(rep.payableCents)}</TD>
                    <TD numeric>{formatCents(rep.paidCents)}</TD>
                    <TD numeric className="font-semibold">
                      {formatCents(rep.totalCents)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </section>
      )}

      {repName && (
        <p className="text-[13px] text-text-secondary">
          Commissions de <strong className="font-semibold text-text-primary">{repName}</strong> ·{" "}
          <Link href={hrefWith(BASE_PATH, { statut: status, mois: month }, { commercial: null })} className="text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
            voir toute l&apos;équipe
          </Link>{" "}
          · <Link href={`/directeur/commerciaux/${salesRepId}`} className="text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">sa fiche</Link>
        </p>
      )}

      {data.rows.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState
              icon={<Coins className="size-5" />}
              title="Aucune commission ne correspond"
              description="Aucune commission pour ces filtres. Élargissez la recherche pour en voir davantage."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={BASE_PATH}>Voir toutes les commissions</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState icon={<Coins className="size-5" />} title="Aucune commission pour l'instant" description="Une commission apparaît dès qu'un contrat est envoyé à une officine par un commercial." />
          )}
        </Card>
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden">
            {data.rows.map((row) => (
              <li key={row.id} className="space-y-2.5 rounded-xl border border-border-subtle bg-surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-text-primary">{row.prospect.name}</p>
                    <p className="truncate text-[12.5px] text-text-tertiary">
                      {row.prospect.city ? `${row.prospect.city} · ` : ""}
                      <Link href={`/directeur/commerciaux/${row.rep.id}`} className="hover:underline">
                        {row.rep.name}
                      </Link>
                    </p>
                  </div>
                  <p className="shrink-0 text-[15px] font-semibold tabular text-text-primary">{formatCents(row.amountCents)}</p>
                </div>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-tertiary">
                  <CommissionStatusBadge status={row.status} />
                  <span>Créée le {formatDate(row.createdAt)}</span>
                  {row.paidAt && <span>· payée le {formatDate(row.paidAt)}</span>}
                </p>
                {row.invoice && (
                  <p className="flex items-center gap-2 text-[12.5px] text-text-secondary">
                    Facture{" "}
                    <Link href={`/directeur/factures/${row.invoice.id}`} className="font-medium text-text-primary hover:underline">
                      {row.invoice.number}
                    </Link>
                    <InvoiceStatusBadge status={row.invoice.status} />
                  </p>
                )}
                {row.note && <p className="text-[12.5px] whitespace-pre-line text-text-secondary">{row.note}</p>}
                <CommissionActions id={row.id} status={row.status} locked={!!row.invoice} officine={row.prospect.name} amountLabel={formatCents(row.amountCents)} note={row.note} />
              </li>
            ))}
          </ul>

          <TableWrapper className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Officine</TH>
                  <TH>Commercial</TH>
                  <TH>Créée le</TH>
                  <TH numeric>Montant</TH>
                  <TH>Statut</TH>
                  <TH>Note</TH>
                  <TH>
                    <span className="sr-only">Gestes</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {data.rows.map((row) => (
                  <TR key={row.id}>
                    <TD className="max-w-[240px]">
                      <span className="block truncate text-[13px] font-medium text-text-primary">{row.prospect.name}</span>
                      {row.prospect.city && <span className="block truncate text-[12px] text-text-tertiary">{row.prospect.city}</span>}
                    </TD>
                    <TD className="max-w-[180px] truncate text-[13px]">
                      <Link href={`/directeur/commerciaux/${row.rep.id}`} className="hover:underline">
                        {row.rep.name}
                      </Link>
                    </TD>
                    <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">{formatDate(row.createdAt)}</TD>
                    <TD numeric className="font-semibold whitespace-nowrap">
                      {formatCents(row.amountCents)}
                    </TD>
                    <TD>
                      <div className="flex flex-col items-start gap-1">
                        <CommissionStatusBadge status={row.status} />
                        {row.status === "PAID" && row.paidAt && <span className="text-[11.5px] text-text-tertiary">le {formatDate(row.paidAt)}</span>}
                        {row.invoice && (
                          <Link href={`/directeur/factures/${row.invoice.id}`} className="text-[11.5px] text-text-secondary hover:underline">
                            Facture {row.invoice.number}
                          </Link>
                        )}
                      </div>
                    </TD>
                    <TD className="max-w-[220px] text-[12.5px] text-text-secondary">
                      <span className="line-clamp-2 whitespace-pre-line">{row.note ?? "—"}</span>
                    </TD>
                    <TD>
                      <CommissionActions id={row.id} status={row.status} locked={!!row.invoice} officine={row.prospect.name} amountLabel={formatCents(row.amountCents)} note={row.note} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>

          <Pager basePath={BASE_PATH} keep={keep} page={data.page} pageCount={data.pageCount} total={data.filteredTotal} noun="commission" />
        </>
      )}
    </div>
  );
}
