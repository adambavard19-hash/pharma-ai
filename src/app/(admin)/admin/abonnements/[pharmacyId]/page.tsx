import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getPharmacyBilling, getPharmacyBillingHistory, latestContractOf } from "@/server/billing/subscriptions";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { contractStage, subscriptionStage, type SubscriptionStatusCode } from "@/core/billing/subscription";
import { CONTRACT_STATUS_LABELS, type ContractStatusCode } from "@/core/sales/pipeline";
import { PageHeader, DataItem } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import { PharmacyBillingActions } from "../billing-actions";

export const metadata: Metadata = { title: "Abonnement de l'officine" };

const PAYMENT_LABELS: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  PAID: { label: "Payé", tone: "success" },
  FAILED: { label: "Échoué", tone: "danger" },
  OPEN: { label: "En attente", tone: "warning" },
  VOID: { label: "Annulé", tone: "neutral" },
  UNCOLLECTIBLE: { label: "Irrécouvrable", tone: "danger" },
  DRAFT: { label: "Brouillon", tone: "neutral" },
};

/**
 * Une officine, tout son parcours commercial : officine et titulaire, contrat
 * et sa version, abonnement (essai, échéance, paiements), et l'historique
 * complet — événements Stripe, factures, événements du dossier.
 */
export default async function PharmacyBillingPage({ params }: { params: Promise<{ pharmacyId: string }> }) {
  await requirePlatformSession();
  const { pharmacyId } = await params;
  const row = await getPharmacyBilling(pharmacyId);
  if (!row) notFound();
  const [history, plans, contracts, invites] = await Promise.all([
    getPharmacyBillingHistory(row.id, row.organizationId),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    prisma.contract.findMany({ where: { OR: [{ pharmacyId: row.id }, { prospect: { pharmacyId: row.id } }] }, orderBy: { version: "desc" }, include: { plan: { select: { name: true } } } }),
    prisma.subscriptionInvite.findMany({ where: { pharmacyId: row.id }, orderBy: { createdAt: "desc" }, take: 5, include: { plan: { select: { name: true } } } }),
  ]);
  const subscription = row.organization.subscription;
  const contract = latestContractOf(row);
  const status = (subscription?.status as SubscriptionStatusCode | undefined) ?? null;
  const stage = subscriptionStage({ status, inviteSentAt: row.subscriptionInvites[0]?.sentAt ?? null, suspendedAt: subscription?.suspendedAt ?? null });
  const cStage = contractStage({ status: contract?.status ?? null });
  const owner = row.memberships[0]?.user ?? null;
  const stripe = stripeConfigState();

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/admin/abonnements">Abonnements & Contrats</Link>
      </Button>
      <PageHeader title={row.name} description={[row.city, owner ? `Titulaire : ${owner.firstName} ${owner.lastName} — ${owner.email}` : "Aucun titulaire actif"].filter(Boolean).join(" · ")} />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={cStage.tone}>Contrat : {cStage.label}</Badge>
        <Badge tone={stage.tone}>Abonnement : {stage.label}</Badge>
        {subscription?.cancelAtPeriodEnd && <Badge tone="danger">Résiliation programmée</Badge>}
        {!row.isActive && <Badge tone="danger">Accès suspendu</Badge>}
        <Link href={`/admin/pharmacies/${row.id}`} className="text-[13px] text-text-secondary underline">Fiche officine</Link>
      </div>

      <PharmacyBillingActions
        pharmacyId={row.id}
        contract={contract ? { id: contract.id, status: contract.status, version: contract.version } : null}
        hasSubscription={Boolean(subscription?.stripeSubscriptionId)}
        subscriptionStatus={status}
        cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
        isActive={row.isActive}
        inviteSent={Boolean(row.subscriptionInvites[0]?.sentAt) && !row.subscriptionInvites[0]?.completedAt}
        plans={plans.map((plan) => ({ id: plan.id, name: plan.name, monthlyPriceCents: plan.monthlyPriceCents, trialDays: plan.trialDays, isDefault: plan.isDefault }))}
        stripeReady={stripe.configured}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Abonnement" description={subscription ? `Offre ${subscription.plan.name}` : "Aucun abonnement Stripe rattaché pour l'instant."} />
          <CardContent className="pt-0">
            {subscription ? (
              <dl className="space-y-3">
                <DataItem label="Statut"><Badge tone={stage.tone}>{stage.label}</Badge>{subscription.suspendedReason ? <span className="ml-2 text-[12.5px] text-text-secondary">{subscription.suspendedReason}</span> : null}</DataItem>
                <DataItem label="Prix">{formatCents(subscription.plan.monthlyPriceCents)} HT / mois</DataItem>
                <DataItem label="Essai">{subscription.trialStartsAt || subscription.trialEndsAt ? `${subscription.trialStartsAt ? formatDate(subscription.trialStartsAt) : "?"} → ${subscription.trialEndsAt ? formatDate(subscription.trialEndsAt) : "?"}` : "Aucun"}</DataItem>
                <DataItem label="Période en cours">{formatDate(subscription.currentPeriodStart)}{subscription.currentPeriodEnd ? ` → ${formatDate(subscription.currentPeriodEnd)}` : ""}</DataItem>
                <DataItem label="Prochain prélèvement">{subscription.nextInvoiceAt && status !== "CANCELED" ? formatDate(subscription.nextInvoiceAt) : "—"}</DataItem>
                <DataItem label="Dernier paiement">{subscription.lastPaymentCents ? `${formatCents(subscription.lastPaymentCents)} le ${formatDate(subscription.lastPaymentAt)}` : "Aucun"}</DataItem>
                {subscription.lastPaymentFailedAt && <DataItem label="Dernier échec">{formatDateTime(subscription.lastPaymentFailedAt)}</DataItem>}
                {subscription.cancelAt && <DataItem label="Résiliation">le {formatDate(subscription.cancelAt)}</DataItem>}
                {subscription.canceledAt && <DataItem label="Résilié le">{formatDate(subscription.canceledAt)}</DataItem>}
              </dl>
            ) : (
              <p className="text-[13.5px] text-text-secondary">
                {row.subscriptionInvites[0]?.sentAt ? `Lien d'abonnement envoyé à ${row.subscriptionInvites[0].sentTo} le ${formatDateTime(row.subscriptionInvites[0].sentAt)}${row.subscriptionInvites[0].openedAt ? `, ouvert le ${formatDateTime(row.subscriptionInvites[0].openedAt)}` : ", pas encore ouvert"}.` : "Aucun lien d'abonnement envoyé."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Contrats" description="Chaque version, son statut et ses dates. Le PDF s'ouvre depuis la console." />
          <CardContent className="pt-0">
            {contracts.length === 0 ? (
              <p className="text-[13.5px] text-text-secondary">Aucun contrat préparé.</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {contracts.map((c) => (
                  <li key={c.id} className="py-2.5 text-[13.5px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text-primary">Version {c.version}</span>
                      <Badge tone={contractStage({ status: c.status }).tone}>{CONTRACT_STATUS_LABELS[c.status as ContractStatusCode]}</Badge>
                      <span className="text-text-secondary">{c.plan?.name ?? "—"} · {formatCents(c.monthlyPriceCents)} HT/mois · {c.durationMonths} mois{c.trialDays ? ` · ${c.trialDays} jours offerts` : ""}</span>
                      <a href={`/api/contrats/apercu/${c.id}`} target="_blank" rel="noreferrer" className="text-brand-700 underline">PDF</a>
                    </div>
                    <p className="text-[12.5px] text-text-tertiary">
                      {[c.sentAt ? `envoyé le ${formatDateTime(c.sentAt)}` : null, c.openedAt ? `ouvert le ${formatDateTime(c.openedAt)}` : null, c.pharmacySignedAt ? `signé pharmacie le ${formatDateTime(c.pharmacySignedAt)}` : null, c.companySignedAt ? `signé société le ${formatDateTime(c.companySignedAt)}` : null, c.finalizedAt ? `finalisé le ${formatDateTime(c.finalizedAt)}` : null, c.refusedAt ? `refusé le ${formatDateTime(c.refusedAt)}` : null, `signature : ${c.signatureProvider}`].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title="Paiements" description="Les factures Stripe reçues par webhook." />
        <CardContent className="pt-0">
          {history.payments.length === 0 ? (
            <p className="text-[13.5px] text-text-secondary">Aucune facture pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {history.payments.map((p) => {
                const label = PAYMENT_LABELS[p.status] ?? { label: p.status, tone: "neutral" as const };
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-[13.5px]">
                    <span className="w-24 text-text-tertiary">{formatDate(p.paidAt ?? p.failedAt ?? p.createdAt)}</span>
                    <span className="font-medium text-text-primary">{formatCents(p.amountCents)}</span>
                    <Badge tone={label.tone}>{label.label}</Badge>
                    {p.periodStart && p.periodEnd && <span className="text-text-secondary">{formatDate(p.periodStart)} → {formatDate(p.periodEnd)}</span>}
                    {p.attemptCount > 1 && <span className="text-text-tertiary">{p.attemptCount} tentatives</span>}
                    {p.hostedInvoiceUrl && <a href={p.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="text-brand-700 underline">Facture</a>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Historique" description="Tout ce qui s'est passé : événements Stripe, liens envoyés, contrat, gestes de la console." />
        <CardContent className="pt-0">
          <ul className="divide-y divide-border-subtle">
            {invites.map((invite) => (
              <li key={invite.id} className="py-2 text-[13px]">
                <span className="text-text-tertiary">{formatDateTime(invite.sentAt ?? invite.createdAt)}</span>
                <span className="ml-3 text-text-primary">Lien d&apos;abonnement ({invite.plan.name}) envoyé à {invite.sentTo}{invite.sentCount > 1 ? ` (${invite.sentCount} envois)` : ""}{invite.openedAt ? `, ouvert le ${formatDateTime(invite.openedAt)}` : ""}{invite.completedAt ? `, abonnement activé le ${formatDateTime(invite.completedAt)}` : ""}</span>
              </li>
            ))}
            {history.events.map((event) => (
              <li key={event.id} className="py-2 text-[13px]">
                <span className="text-text-tertiary">{formatDateTime(event.receivedAt)}</span>
                <span className="ml-3 font-mono text-[11.5px] text-text-tertiary">{event.type}</span>
                <span className="ml-3 text-text-primary">{event.summary}</span>
                {event.error && <span className="ml-2 text-danger-700">erreur : {event.error}</span>}
              </li>
            ))}
            {history.dossierEvents.map((event) => (
              <li key={event.id} className="py-2 text-[13px]">
                <span className="text-text-tertiary">{formatDateTime(event.createdAt)}</span>
                <span className="ml-3 text-text-primary">{event.summary}</span>
                <span className="ml-2 text-text-tertiary">— {event.actorLabel ?? event.actorType}</span>
              </li>
            ))}
            {invites.length + history.events.length + history.dossierEvents.length === 0 && <li className="py-2 text-[13.5px] text-text-secondary">Rien pour l&apos;instant.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
