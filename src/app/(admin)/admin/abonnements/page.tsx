import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Settings2 } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { latestContractOf, listPharmaciesBilling } from "@/server/billing/subscriptions";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { contractStage, subscriptionStage, trialEndingSoon, type SubscriptionStatusCode } from "@/core/billing/subscription";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { formatCents, formatDate } from "@/lib/format";
import { PharmacyBillingActions } from "./billing-actions";

export const metadata: Metadata = { title: "Abonnements & Contrats" };

export const FILTERS: Record<string, { label: string; test: (row: { status: SubscriptionStatusCode | null; contractStatus: string | null; trialEndsAt: Date | null; lastPaymentFailedAt: Date | null; inviteSentAt: Date | null }) => boolean }> = {
  essai: { label: "En essai", test: (r) => r.status === "TRIALING" },
  actifs: { label: "Actifs", test: (r) => r.status === "ACTIVE" },
  "contrats-envoyes": { label: "Contrats envoyés", test: (r) => r.contractStatus === "SENT" || r.contractStatus === "OPENED" },
  "contrats-attente": { label: "Contrats en attente", test: (r) => r.contractStatus === null || r.contractStatus === "DRAFT" || r.contractStatus === "SENT" || r.contractStatus === "OPENED" || r.contractStatus === "SIGNED_PHARMACY" },
  "contrats-signes": { label: "Contrats signés", test: (r) => r.contractStatus === "FINALIZED" },
  "fin-essai": { label: "Essais se terminant", test: (r) => r.status === "TRIALING" && trialEndingSoon(r.trialEndsAt, new Date(), 7) },
  impayes: { label: "Paiements échoués", test: (r) => r.status === "PAST_DUE" || r.status === "UNPAID" || Boolean(r.lastPaymentFailedAt && r.status !== "ACTIVE") },
  resilies: { label: "Résiliés", test: (r) => r.status === "CANCELED" || r.status === "INCOMPLETE_EXPIRED" },
  invites: { label: "Invitations envoyées", test: (r) => r.status === null && Boolean(r.inviteSentAt) },
};

/**
 * Abonnements & Contrats : une carte par officine, l'état du contrat, de
 * l'abonnement, de l'essai, du prochain prélèvement, et les gestes.
 * Les identifiants Stripe n'apparaissent pas : la console parle d'officines.
 */
export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ filtre?: string }> }) {
  await requirePlatformSession();
  const { filtre } = await searchParams;
  const [rows, plans, stripe] = await Promise.all([listPharmaciesBilling(), prisma.plan.findMany({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }), Promise.resolve(stripeConfigState())]);
  const filter = filtre ? FILTERS[filtre] : null;

  const cards = rows
    .map((row) => {
      const subscription = row.organization.subscription;
      const contract = latestContractOf(row);
      const invite = row.subscriptionInvites[0] ?? null;
      const status = (subscription?.status as SubscriptionStatusCode | undefined) ?? null;
      return { row, subscription, contract, invite, status, contractStatus: contract?.status ?? null };
    })
    .filter((card) => !filter || filter.test({ status: card.status, contractStatus: card.contractStatus, trialEndsAt: card.subscription?.trialEndsAt ?? null, lastPaymentFailedAt: card.subscription?.lastPaymentFailedAt ?? null, inviteSentAt: card.invite?.sentAt ?? null }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Abonnements & Contrats"
        description="Pour chaque officine : le contrat, l'abonnement, l'essai, le prochain prélèvement. Tout se pilote d'ici ; le pharmacien n'a rien à configurer."
        actions={
          <Button asChild variant="outline" leadingIcon={<Settings2 className="size-4" />}>
            <Link href="/admin/abonnements/offres">Offres</Link>
          </Button>
        }
      />

      {!stripe.configured && (
        <Alert tone="warning" title="Stripe n'est pas configuré">
          {stripe.detail} Les contrats se préparent et s&apos;envoient ; les liens d&apos;abonnement attendront la clé de test (STRIPE_SECRET_KEY) et le secret de webhook (STRIPE_WEBHOOK_SECRET).
        </Alert>
      )}
      {stripe.configured && !stripe.webhookConfigured && (
        <Alert tone="warning" title="Webhook Stripe non configuré">L&apos;état des abonnements ne se mettra pas à jour tout seul tant que STRIPE_WEBHOOK_SECRET n&apos;est pas renseigné. Le bouton « Relire chez Stripe » reste disponible.</Alert>
      )}
      {plans.length === 0 && (
        <Alert tone="info" title="Aucune offre">Créez l&apos;offre PharmaBoost (prix mensuel, durée d&apos;essai) dans <Link href="/admin/abonnements/offres" className="underline">Offres</Link> avant de préparer un contrat.</Alert>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Link href="/admin/abonnements" className={`rounded-full border px-3 py-1 text-[12.5px] font-medium ${!filter ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border-default text-text-secondary"}`}>Toutes ({rows.length})</Link>
        {Object.entries(FILTERS).map(([key, def]) => (
          <Link key={key} href={`/admin/abonnements?filtre=${key}`} className={`rounded-full border px-3 py-1 text-[12.5px] font-medium ${filtre === key ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border-default text-text-secondary"}`}>{def.label}</Link>
        ))}
      </div>

      {cards.length === 0 ? (
        <EmptyState icon={<CreditCard className="size-6" />} title="Aucune officine ici" description={filter ? "Aucune officine ne correspond à ce filtre." : "Créez une officine dans « Officines clientes » pour démarrer son parcours."} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {cards.map(({ row, subscription, contract, invite, status }) => {
            const stage = subscriptionStage({ status, inviteSentAt: invite?.sentAt ?? null, suspendedAt: subscription?.suspendedAt ?? null });
            const cStage = contractStage({ status: contract?.status ?? null });
            const price = subscription?.plan.monthlyPriceCents ?? contract?.monthlyPriceCents ?? invite?.plan.monthlyPriceCents ?? null;
            const owner = row.memberships[0]?.user ?? null;
            const lastPayment = subscription?.payments[0] ?? null;
            return (
              <li key={row.id}>
                <Card>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Link href={`/admin/abonnements/${row.id}`} className="text-[16px] font-semibold text-text-primary hover:underline">{row.name}</Link>
                        <p className="text-[12.5px] text-text-tertiary">{[row.city, owner ? `${owner.firstName} ${owner.lastName}` : null, owner?.email].filter(Boolean).join(" · ")}</p>
                      </div>
                      {!row.isActive && <Badge tone="danger">Accès suspendu</Badge>}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-3">
                      <div><dt className="text-text-tertiary">Contrat</dt><dd><Badge tone={cStage.tone}>{cStage.label}</Badge></dd></div>
                      <div><dt className="text-text-tertiary">Abonnement</dt><dd><Badge tone={stage.tone}>{stage.label}</Badge>{subscription?.cancelAtPeriodEnd ? <span className="ml-1 text-[12px] text-danger-700">fin de période</span> : null}</dd></div>
                      <div><dt className="text-text-tertiary">Prix</dt><dd className="font-medium text-text-primary">{price !== null ? `${formatCents(price)}/mois` : "—"}</dd></div>
                      <div><dt className="text-text-tertiary">Essai</dt><dd className="text-text-primary">{subscription?.trialStartsAt && subscription.trialEndsAt ? `${formatDate(subscription.trialStartsAt)} → ${formatDate(subscription.trialEndsAt)}` : subscription?.trialEndsAt ? `→ ${formatDate(subscription.trialEndsAt)}` : "—"}</dd></div>
                      <div><dt className="text-text-tertiary">Prochaine échéance</dt><dd className="text-text-primary">{subscription?.nextInvoiceAt && status !== "CANCELED" ? formatDate(subscription.nextInvoiceAt) : "—"}</dd></div>
                      <div><dt className="text-text-tertiary">Dernier paiement</dt><dd className="text-text-primary">{lastPayment ? `${formatCents(lastPayment.amountCents)} · ${lastPayment.status === "PAID" ? "payé" : lastPayment.status === "FAILED" ? "échoué" : lastPayment.status.toLowerCase()} le ${formatDate(lastPayment.paidAt ?? lastPayment.failedAt ?? lastPayment.createdAt)}` : subscription?.lastPaymentCents ? `${formatCents(subscription.lastPaymentCents)} le ${formatDate(subscription.lastPaymentAt)}` : "—"}</dd></div>
                    </dl>
                    <PharmacyBillingActions
                      pharmacyId={row.id}
                      contract={contract ? { id: contract.id, status: contract.status, version: contract.version } : null}
                      hasSubscription={Boolean(subscription?.stripeSubscriptionId)}
                      subscriptionStatus={status}
                      cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
                      isActive={row.isActive}
                      inviteSent={Boolean(invite?.sentAt) && !invite?.completedAt}
                      plans={plans.map((plan) => ({ id: plan.id, name: plan.name, monthlyPriceCents: plan.monthlyPriceCents, trialDays: plan.trialDays, isDefault: plan.isDefault }))}
                      stripeReady={stripe.configured}
                      compact
                    />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
