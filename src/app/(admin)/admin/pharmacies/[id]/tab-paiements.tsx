import { Banknote, ExternalLink, FileDown } from "lucide-react";
import { loadPaymentsTab, type Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import { AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { PaymentStatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";

/** Les factures Stripe reçues pour cette officine, telles que notifiées par webhook. */
export async function PaymentsTab({ base }: { base: Pharmacy360 }) {
  const payments = await loadPaymentsTab(base);
  if (payments.length === 0) {
    return (
      <AdminSection>
        <EmptyState icon={<Banknote className="size-5" />} title="Aucun paiement reçu de Stripe" description="Les factures apparaissent ici dès que Stripe les notifie : payées, échouées ou en attente." />
      </AdminSection>
    );
  }

  const paid = payments.filter((p) => p.status === "PAID");
  const failed = payments.filter((p) => p.status === "FAILED" || p.status === "UNCOLLECTIBLE");
  const open = payments.filter((p) => p.status === "OPEN");
  const lastPaid = paid.reduce<Date | null>((latest, p) => (p.paidAt && (!latest || p.paidAt > latest) ? p.paidAt : latest), null);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Encaissé" value={formatEuros(paid.reduce((sum, p) => sum + p.amountCents, 0))} hint={`${paid.length} facture${paid.length > 1 ? "s" : ""} payée${paid.length > 1 ? "s" : ""}`} tone="success" />
        <KpiTile label="Dernier paiement" value={lastPaid ? formatFrenchDate(lastPaid) : "—"} />
        <KpiTile label="En attente" value={open.length} hint={open.length > 0 ? formatEuros(open.reduce((sum, p) => sum + p.amountCents, 0)) : undefined} tone={open.length > 0 ? "warning" : "default"} />
        <KpiTile label="Échecs" value={failed.length} hint={failed.length > 0 ? formatEuros(failed.reduce((sum, p) => sum + p.amountCents, 0)) : undefined} tone={failed.length > 0 ? "danger" : "default"} />
      </div>

      <AdminSection title="Factures" description={payments.length >= 120 ? "Les 120 factures les plus récentes." : "Toutes les factures reçues, de la plus récente à la plus ancienne."} padded={false}>
        <TableWrapper className="rounded-none border-0">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Statut</TH>
                <TH numeric>Montant</TH>
                <TH>Période</TH>
                <TH numeric>Tentatives</TH>
                <TH>Facture</TH>
              </TR>
            </THead>
            <TBody>
              {payments.map((p) => (
                <TR key={p.id}>
                  <TD>{formatFrenchDate(p.paidAt ?? p.failedAt ?? p.createdAt)}</TD>
                  <TD>
                    <PaymentStatusBadge status={p.status} />
                  </TD>
                  <TD numeric className="font-medium">
                    {formatEuros(p.amountCents)}
                  </TD>
                  <TD className="text-[13px] text-text-secondary">{p.periodStart && p.periodEnd ? `${formatFrenchDate(p.periodStart)} → ${formatFrenchDate(p.periodEnd)}` : "—"}</TD>
                  <TD numeric>{p.attemptCount}</TD>
                  <TD>
                    <span className="flex flex-wrap gap-3">
                      {p.hostedInvoiceUrl && (
                        <a href={p.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                          Stripe
                        </a>
                      )}
                      {p.invoicePdfUrl && (
                        <a href={p.invoicePdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
                          <FileDown className="size-3.5" aria-hidden="true" />
                          PDF
                        </a>
                      )}
                      {!p.hostedInvoiceUrl && !p.invoicePdfUrl && <span className="text-[12.5px] text-text-tertiary">—</span>}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      </AdminSection>
    </div>
  );
}
