import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { getDirectorInvoice } from "@/server/services/sales/director-money";
import { canDeleteInvoice, invoiceGesturesFor } from "@/core/sales/director/invoice";
import { COMMISSION_STATUS_LABELS, type CommissionStatusCode } from "@/core/sales/pipeline";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { AdminSection, FactList } from "@/components/admin/page-header";
import { CommissionStatusBadge } from "@/components/sales/status-badge";
import { InvoiceStatusBadge } from "@/components/sales/invoice-status-badge";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import { InvoiceActions } from "./invoice-actions";

export const metadata: Metadata = { title: "Facture" };

/**
 * Une facture de commercial : ce qu'elle réclame, l'écart éventuel avec les
 * commissions rattachées (dit en clair, jamais bloquant), le fichier, les
 * étapes, et les gestes que l'état permet.
 */
export default async function DirectorInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireDirectorSession();
  const { id } = await params;
  const invoice = await getDirectorInvoice(id);
  if (!invoice) notFound();

  const gestures = invoiceGesturesFor(invoice.status);
  const canDelete = canDeleteInvoice(invoice.status);
  const gapTone = invoice.gap.kind === "MATCH" ? "success" : invoice.gap.kind === "NO_COMMISSION" ? "info" : "warning";

  const steps: { label: string; detail: string; done: boolean }[] = [
    { label: "Reçue", detail: `${formatDateTime(invoice.createdAt)} · enregistrée par ${invoice.createdByLabel}`, done: true },
    ...(invoice.status === "REJECTED"
      ? [{ label: "Refusée", detail: invoice.rejectedAt ? formatDateTime(invoice.rejectedAt) : "—", done: true }]
      : [
          { label: "Validée", detail: invoice.approvedAt ? formatDateTime(invoice.approvedAt) : "En attente de votre décision", done: !!invoice.approvedAt },
          { label: "Payée", detail: invoice.paidAt ? formatDateTime(invoice.paidAt) : "Pas encore payée", done: !!invoice.paidAt },
        ]),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        breadcrumb={
          <Link href="/directeur/factures" className="inline-flex items-center gap-1 text-[12.5px] text-text-tertiary hover:text-text-primary">
            <ChevronLeft className="size-3.5" aria-hidden="true" /> Factures
          </Link>
        }
        title={`Facture ${invoice.number}`}
        description={`${invoice.rep.name} · du ${formatDate(invoice.issuedAt)}${invoice.periodLabel ? ` · ${invoice.periodLabel}` : ""}`}
        actions={<InvoiceStatusBadge status={invoice.status} />}
      />

      {invoice.status === "REJECTED" && (
        <Alert tone="danger" title="Facture refusée">
          {invoice.rejectionReason ?? "Aucun motif n'a été gardé."}
        </Alert>
      )}

      <Alert tone={gapTone} title={invoice.gap.kind === "MATCH" ? "Le montant correspond" : invoice.gap.kind === "NO_COMMISSION" ? "Montant non rapproché" : "Écart de montant"}>
        {invoice.gap.message}
      </Alert>

      {(gestures.length > 0 || canDelete) && (
        <AdminSection title="Que faire de cette facture ?" description={invoice.status === "RECEIVED" ? "Validez-la si elle est juste, refusez-la sinon. Le commercial en est informé dans les deux cas." : invoice.status === "APPROVED" ? "Elle est validée : payez-la quand le virement est fait." : undefined}>
          <InvoiceActions id={invoice.id} number={invoice.number} status={invoice.status} commissionCount={invoice.commissions.length} gap={invoice.gap} canDelete={canDelete} />
        </AdminSection>
      )}

      <AdminSection title="La facture">
        <FactList
          items={[
            { label: "Commercial", value: <Link href={`/directeur/commerciaux/${invoice.rep.id}`} className="font-medium hover:underline">{invoice.rep.name}</Link> },
            { label: "Montant", value: <span className="font-semibold tabular">{formatCents(invoice.amountCents)}</span> },
            { label: "Date de la facture", value: formatDate(invoice.issuedAt) },
            { label: "Période concernée", value: invoice.periodLabel },
            {
              label: "Fichier",
              value: invoice.hasFile ? (
                <Button asChild variant="outline" size="sm" leadingIcon={<Download className="size-3.5" />}>
                  <a href={`/api/directeur/factures/${invoice.id}/fichier`}>Télécharger le PDF</a>
                </Button>
              ) : (
                "Aucun fichier joint"
              ),
              hint: invoice.hasFile ? invoice.fileName : undefined,
            },
            { label: "Note", value: invoice.note ? <span className="whitespace-pre-line">{invoice.note}</span> : null },
          ]}
        />
      </AdminSection>

      <AdminSection title="Commissions rattachées" description={invoice.commissions.length > 0 ? `${invoice.commissions.length} commission${invoice.commissions.length > 1 ? "s" : ""} · ${formatCents(invoice.commissionsCents)}` : undefined} padded={invoice.commissions.length === 0}>
        {invoice.commissions.length === 0 ? (
          <p className="text-[13.5px] text-text-secondary">{invoice.status === "REJECTED" ? "Les commissions ont été libérées au moment du refus." : "Aucune commission n'est rattachée à cette facture."}</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {invoice.commissions.map((commission) => (
              <li key={commission.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-text-primary">{commission.prospectName}</p>
                  <p className="truncate text-[12px] text-text-tertiary">
                    {commission.city ? `${commission.city} · ` : ""}créée le {formatDate(commission.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <CommissionStatusBadge status={commission.status} />
                  <span className="text-[13.5px] font-semibold tabular text-text-primary" aria-label={`${COMMISSION_STATUS_LABELS[commission.status as CommissionStatusCode] ?? commission.status}, ${formatCents(commission.amountCents)}`}>
                    {formatCents(commission.amountCents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection title="Les étapes">
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start gap-3">
              <span aria-hidden="true" className={step.done ? "mt-1.5 size-2.5 shrink-0 rounded-full bg-brand-600" : "mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-border-default"} />
              <div className="min-w-0">
                <p className={step.done ? "text-[13.5px] font-medium text-text-primary" : "text-[13.5px] text-text-tertiary"}>{step.label}</p>
                <p className="text-[12.5px] text-text-secondary">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </AdminSection>
    </div>
  );
}
