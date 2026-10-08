import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Banknote, Clock3, ExternalLink, ReceiptText } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { PAYMENT_FILTERS, listPayments, paymentFilterStatuses, paymentTotals } from "@/server/services/admin/billing-admin";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { FilterChips, PERIODS, hrefWith, resolvePeriod } from "@/components/admin/filters";
import { PaymentStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from "@/components/ui/table";
import { DateText, RowLink, StripeNotConfigured, readParam } from "../abonnements/billing-ui";

export const metadata: Metadata = { title: "Paiements" };

/**
 * Les factures Stripe reçues (une ligne par facture, écrite par les
 * webhooks) : officine, montant, statut, période, tentatives, liens vers la
 * facture. Les totaux portent sur la période choisie. Rien n'est calculé
 * d'avance ni estimé : sans facture reçue, la page le dit.
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const statut = readParam(params, "statut");
  const period = resolvePeriod(readParam(params, "periode"));
  const statuses = paymentFilterStatuses(statut);
  const activeStatut = statuses ? statut : null;
  const stripe = stripeConfigState();

  const { rows, all } = await listPayments({ statuses, days: period.days });
  const totals = paymentTotals(all);
  const keep = { statut: activeStatut, periode: period.value };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Finances", href: "/admin/abonnements" }}
        title="Paiements"
        description="Les factures reçues de Stripe : payées, échouées, en attente. Chaque montant vient d'une facture réelle."
        actions={
          <Button asChild variant="outline" size="sm" leadingIcon={<AlertTriangle className="size-4" />}>
            <Link href="/admin/impayes">Impayés</Link>
          </Button>
        }
      />

      {!stripe.configured && <StripeNotConfigured detail={stripe.detail}>Aucune facture ne peut arriver tant que Stripe n&apos;est pas branché ; celles déjà reçues restent affichées.</StripeNotConfigured>}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-medium text-text-tertiary">Période :</span>
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={hrefWith("/admin/paiements", keep, { periode: p.value })}
            aria-current={p.value === period.value ? "true" : undefined}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${p.value === period.value ? "border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900" : "border-border-default bg-surface-card text-text-secondary hover:border-brand-300 hover:text-text-primary"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label={`Encaissé — ${period.label}`} value={formatEuros(totals.paidCents)} hint={`${totals.paidCount} facture${totals.paidCount > 1 ? "s" : ""} payée${totals.paidCount > 1 ? "s" : ""}`} href={hrefWith("/admin/paiements", keep, { statut: "paye" })} tone="success" icon={<Banknote className="size-4" />} />
        <KpiTile label={`En échec — ${period.label}`} value={formatEuros(totals.failedCents)} hint={`${totals.failedCount} facture${totals.failedCount > 1 ? "s" : ""} échouée${totals.failedCount > 1 ? "s" : ""} ou irrécouvrable${totals.failedCount > 1 ? "s" : ""}`} href={hrefWith("/admin/paiements", keep, { statut: "echoue" })} tone={totals.failedCount > 0 ? "danger" : "default"} icon={<AlertTriangle className="size-4" />} />
        <KpiTile label={`En attente — ${period.label}`} value={formatEuros(totals.openCents)} hint={`${totals.openCount} facture${totals.openCount > 1 ? "s" : ""} ouverte${totals.openCount > 1 ? "s" : ""}`} href={hrefWith("/admin/paiements", keep, { statut: "en-attente" })} tone={totals.openCount > 0 ? "warning" : "default"} icon={<Clock3 className="size-4" />} />
      </div>

      <AdminSection padded={false}>
        <div className="border-b border-border-subtle p-4">
          <FilterChips
            basePath="/admin/paiements"
            param="statut"
            current={activeStatut}
            keep={{ periode: period.value }}
            label="Filtrer par statut"
            options={[
              { value: null, label: "Toutes", count: all.length },
              ...PAYMENT_FILTERS.map((f) => ({ value: f.key, label: f.label, count: all.filter((p) => (f.statuses as readonly string[]).includes(p.status)).length })),
            ]}
          />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<ReceiptText className="size-6" />} title="Aucune facture sur cette période" description={stripe.configured ? "Les factures apparaissent ici dès que Stripe les signale (paiement réussi, échec, facture ouverte)." : "Stripe n'est pas configuré : aucune facture n'a pu être reçue."} />
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Officine</TH>
                  <TH numeric>Montant</TH>
                  <TH>Statut</TH>
                  <TH>Période facturée</TH>
                  <TH numeric>Tentatives</TH>
                  <TH>Facture</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((p) => {
                  const pharmacy = p.subscription.organization.pharmacies[0] ?? null;
                  return (
                    <TR key={p.id} interactive>
                      <TD><DateText date={p.paidAt ?? p.failedAt ?? p.createdAt} /></TD>
                      <TD>
                        {pharmacy ? <RowLink href={`/admin/abonnements/${pharmacy.id}`}>{pharmacy.name}</RowLink> : <span className="text-text-tertiary">Organisation sans officine</span>}
                        <p className="text-[12px] text-text-tertiary">{[pharmacy?.city, p.subscription.plan.name].filter(Boolean).join(" · ")}</p>
                      </TD>
                      <TD numeric className="font-medium">{formatEuros(p.amountCents)}</TD>
                      <TD><PaymentStatusBadge status={p.status} /></TD>
                      <TD className="text-text-secondary tabular-nums">{p.periodStart && p.periodEnd ? `${formatFrenchDate(p.periodStart)} → ${formatFrenchDate(p.periodEnd)}` : "—"}</TD>
                      <TD numeric>{p.attemptCount || "—"}</TD>
                      <TD>
                        <div className="flex gap-3 text-[13px]">
                          {p.hostedInvoiceUrl && <a href={p.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300">Voir <ExternalLink className="size-3" aria-hidden="true" /></a>}
                          {p.invoicePdfUrl && <a href={p.invoicePdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300">PDF <ExternalLink className="size-3" aria-hidden="true" /></a>}
                          {!p.hostedInvoiceUrl && !p.invoicePdfUrl && <span className="text-text-tertiary">—</span>}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        )}
        {rows.length > 0 && <p className="border-t border-border-subtle px-4 py-2.5 text-[12px] text-text-tertiary">{rows.length} facture{rows.length > 1 ? "s" : ""}{rows.length >= 300 ? " (les 300 plus récentes)" : ""} — {period.label}.</p>}
      </AdminSection>
    </div>
  );
}
