import type { Metadata } from "next";
import Link from "next/link";
import { Download, Inbox, ShieldOff, ShoppingCart } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { LEAD_STATUS_LABELS, listActivityPartners, listConsoleLeads, listConsoleOrders, type ConsoleOrderRow } from "@/server/services/partners/orders-admin";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { INTEGRATION_MODE_LABELS, LEAD_KIND_LABELS, ORDER_STATUS_LABELS } from "@/core/partners/status";
import { formatCents, formatDateTime } from "@/lib/format";
import { OrderStatusButton } from "./order-status-button";

export const metadata: Metadata = { title: "Commandes & leads partenaires" };

const ORDER_TONES: Record<ConsoleOrderRow["status"], "neutral" | "info" | "success" | "danger" | "warning"> = {
  SUBMITTED: "info",
  TRANSMITTED: "warning",
  CONFIRMED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

function OrderBadge({ status }: { status: ConsoleOrderRow["status"] }) {
  return <Badge tone={ORDER_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

function PharmacyCell({ pharmacy }: { pharmacy: { name: string; city: string | null; isDemo: boolean } }) {
  return (
    <>
      <span className="block text-[13px] font-medium text-text-primary">{pharmacy.name}</span>
      <span className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
        {pharmacy.city ?? "—"}
        {pharmacy.isDemo && <Badge tone="neutral">Démo</Badge>}
      </span>
    </>
  );
}

function Lines({ order }: { order: ConsoleOrderRow }) {
  if (order.lines.length === 0) return <span className="text-text-tertiary">Aucune ligne</span>;
  return (
    <details>
      <summary className="cursor-pointer text-[12.5px] text-text-secondary">
        {order.lines.length} ligne{order.lines.length > 1 ? "s" : ""} · {order.units} unité{order.units > 1 ? "s" : ""}
      </summary>
      <ul className="mt-1.5 space-y-0.5 text-[12px] text-text-secondary">
        {order.lines.map((line) => (
          <li key={line.id} className="break-words">
            {line.quantity} × {line.name}
            {line.ean && <span className="font-mono text-text-tertiary"> · {line.ean}</span>}
            {line.unitPriceCents !== null && <span className="text-text-tertiary"> · {formatCents(line.unitPriceCents)} HT</span>}
          </li>
        ))}
      </ul>
      {order.note && <p className="mt-1.5 text-[12px] break-words text-text-secondary">Note de l&apos;officine : {order.note}</p>}
    </details>
  );
}

/**
 * Les commandes et prises de contact attribuées à PharmaBoost. Ni patient ni
 * ordonnance : une officine, un partenaire, des produits, un identifiant
 * d'attribution. L'équipe constate ici la transmission et la confirmation.
 */
export default async function PartnerOrdersPage({ searchParams }: { searchParams: Promise<{ partenaire?: string }> }) {
  await requirePlatformSession();
  const { partenaire } = await searchParams;
  const partners = await listActivityPartners();
  const partnerId = partners.some((partner) => partner.id === partenaire) ? (partenaire as string) : null;
  const [orders, leads] = await Promise.all([listConsoleOrders({ partnerId }), listConsoleLeads({ partnerId })]);
  const exportHref = `/admin/partenaires/commandes/export${partnerId ? `?partenaire=${partnerId}` : ""}`;
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-[12.5px] font-medium ${active ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300" : "border-border-default text-text-secondary"}`;

  return (
    <>
      <PageHeader
        title="Commandes & leads"
        description="Ce que les officines ont commandé ou demandé aux partenaires depuis PharmaBoost, avec leur identifiant d'attribution."
        actions={
          <Button asChild variant="outline" leadingIcon={<Download className="size-4" />}>
            <a href={exportHref}>Exporter les commandes (CSV)</a>
          </Button>
        }
      />

      <Alert tone="info" title="Ni patient ni ordonnance" icon={<ShieldOff className="size-[18px]" aria-hidden="true" />}>
        Une commande ou un lead porte l&apos;officine, le partenaire, les produits et l&apos;identifiant d&apos;attribution, rien d&apos;autre. L&apos;export CSV, destiné aux partenaires en mode import / export, exclut les officines de démonstration ; filtrez par partenaire pour n&apos;envoyer à chacun que ses commandes.
      </Alert>

      {partners.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Link href="/admin/partenaires/commandes" className={chip(!partnerId)}>
            Tous les partenaires
          </Link>
          {partners.map((partner) => (
            <Link key={partner.id} href={`/admin/partenaires/commandes?partenaire=${partner.id}`} className={chip(partnerId === partner.id)}>
              {partner.name}
            </Link>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <SectionHeader title="Commandes" description={orders.length ? `${orders.length} commande${orders.length > 1 ? "s" : ""}, les plus récentes d'abord.` : undefined} />
        {orders.length === 0 ? (
          <Card>
            <EmptyState icon={<ShoppingCart className="size-5" />} title="Aucune commande" description="Les commandes passées par les officines auprès des partenaires apparaîtront ici." />
          </Card>
        ) : (
          <>
            <ul className="space-y-2.5 md:hidden">
              {orders.map((order) => (
                <li key={order.id} className="space-y-2 rounded-xl border border-border-subtle bg-surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <PharmacyCell pharmacy={order.pharmacy} />
                    </div>
                    <OrderBadge status={order.status} />
                  </div>
                  <p className="text-[12.5px] text-text-secondary">
                    {order.partner.name}
                    {order.brand ? ` · ${order.brand.name}` : ""} · {INTEGRATION_MODE_LABELS[order.integrationMode]}
                  </p>
                  <Lines order={order} />
                  <p className="text-[13px] font-medium text-text-primary">{order.totalCents === null ? "Montant non renseigné" : `${formatCents(order.totalCents)} HT`}</p>
                  <p className="text-[12px] text-text-tertiary">
                    {formatDateTime(order.createdAt)} · <span className="font-mono">{order.attributionCode}</span>
                    {order.partnerReference && <> · réf. {order.partnerReference}</>}
                  </p>
                  {order.statusDetail && <p className="text-[12px] break-words text-text-secondary">{order.statusDetail}</p>}
                  <OrderStatusButton order={order} />
                </li>
              ))}
            </ul>
            <TableWrapper className="hidden md:block">
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Officine</TH>
                    <TH>Partenaire · marque</TH>
                    <TH>Lignes</TH>
                    <TH numeric>Montant HT</TH>
                    <TH>Mode</TH>
                    <TH>Statut</TH>
                    <TH>Attribution · réf.</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {orders.map((order) => (
                    <TR key={order.id}>
                      <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">{formatDateTime(order.createdAt)}</TD>
                      <TD>
                        <PharmacyCell pharmacy={order.pharmacy} />
                      </TD>
                      <TD className="text-[13px]">
                        <span className="block">{order.partner.name}</span>
                        <span className="block text-[12px] text-text-tertiary">{order.brand?.name ?? "—"}</span>
                      </TD>
                      <TD className="max-w-[260px]">
                        <Lines order={order} />
                      </TD>
                      <TD numeric>{order.totalCents === null ? "—" : formatCents(order.totalCents)}</TD>
                      <TD className="text-[12.5px] text-text-secondary">{INTEGRATION_MODE_LABELS[order.integrationMode]}</TD>
                      <TD>
                        <OrderBadge status={order.status} />
                        {order.statusDetail && (
                          <span className="mt-1 block max-w-[200px] truncate text-[11.5px] text-text-tertiary" title={order.statusDetail}>
                            {order.statusDetail}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <span className="block font-mono text-[12px] text-text-primary">{order.attributionCode}</span>
                        <span className="block text-[12px] text-text-tertiary">{order.partnerReference ?? "sans réf. partenaire"}</span>
                      </TD>
                      <TD>
                        <OrderStatusButton order={order} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Leads" description={leads.length ? `${leads.length} prise${leads.length > 1 ? "s" : ""} de contact attribuée${leads.length > 1 ? "s" : ""}.` : undefined} />
        {leads.length === 0 ? (
          <Card>
            <EmptyState icon={<Inbox className="size-5" />} title="Aucun lead" description="Les demandes de contact et ouvertures de portail ou de formulaire partenaire apparaîtront ici." />
          </Card>
        ) : (
          <>
            <ul className="space-y-2.5 md:hidden">
              {leads.map((lead) => (
                <li key={lead.id} className="space-y-1.5 rounded-xl border border-border-subtle bg-surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <PharmacyCell pharmacy={lead.pharmacy} />
                    </div>
                    <Badge tone="neutral">{LEAD_STATUS_LABELS[lead.status] ?? lead.status}</Badge>
                  </div>
                  <p className="text-[12.5px] text-text-secondary">
                    {LEAD_KIND_LABELS[lead.kind]} · {lead.partner.name}
                    {lead.brand ? ` · ${lead.brand.name}` : ""}
                  </p>
                  <p className="text-[12px] text-text-tertiary">
                    {formatDateTime(lead.createdAt)} · <span className="font-mono">{lead.attributionCode}</span>
                  </p>
                </li>
              ))}
            </ul>
            <TableWrapper className="hidden md:block">
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Officine</TH>
                    <TH>Partenaire · marque</TH>
                    <TH>Type</TH>
                    <TH>Statut</TH>
                    <TH>Attribution</TH>
                  </TR>
                </THead>
                <TBody>
                  {leads.map((lead) => (
                    <TR key={lead.id}>
                      <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">{formatDateTime(lead.createdAt)}</TD>
                      <TD>
                        <PharmacyCell pharmacy={lead.pharmacy} />
                      </TD>
                      <TD className="text-[13px]">
                        <span className="block">{lead.partner.name}</span>
                        <span className="block text-[12px] text-text-tertiary">{lead.brand?.name ?? "—"}</span>
                      </TD>
                      <TD className="text-[12.5px] text-text-secondary">{LEAD_KIND_LABELS[lead.kind]}</TD>
                      <TD>
                        <Badge tone="neutral">{LEAD_STATUS_LABELS[lead.status] ?? lead.status}</Badge>
                      </TD>
                      <TD className="font-mono text-[12px]">{lead.attributionCode}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </>
        )}
      </section>
    </>
  );
}
