import Link from "next/link";
import { CreditCard, PencilLine } from "lucide-react";
import { loadSubscriptionTab, type Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import { AdminSection, FactList } from "@/components/admin/page-header";
import { CancellationStatusBadge, SubscriptionStatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { CANCELLATION_CHANNELS, CANCELLATION_REASONS } from "@/core/admin/statuses";
import { EmptyLine } from "./shared";

/** L'onglet Abonnement : l'état exact, le tarif contractuel et son historique, les résiliations. */
export async function SubscriptionTab({ base, now }: { base: Pharmacy360; now: Date }) {
  const { pharmacy, subscription, price } = base;
  const editHref = `/admin/abonnements/${pharmacy.id}`;

  if (!subscription || !price) {
    return (
      <AdminSection>
        <EmptyState
          icon={<CreditCard className="size-5" />}
          title="Aucun abonnement pour l'instant"
          description="L'abonnement naît de la souscription du titulaire (lien d'activation Stripe) après la signature du contrat."
          action={
            <Button asChild size="sm">
              <Link href={editHref}>Préparer l&apos;abonnement</Link>
            </Button>
          }
        />
      </AdminSection>
    );
  }

  const data = await loadSubscriptionTab(base);

  return (
    <div className="space-y-5">
      <AdminSection
        title="Abonnement"
        description="L'état tel que reçu de Stripe et décidé par la console."
        action={
          <Button asChild size="sm" leadingIcon={<PencilLine className="size-4" />}>
            <Link href={editHref}>Modifier l&apos;abonnement</Link>
          </Button>
        }
      >
        <FactList
          className="lg:grid-cols-3"
          items={[
            { label: "Offre", value: subscription.plan.name },
            { label: "Statut", value: <SubscriptionStatusBadge status={subscription.status} /> },
            {
              label: "Tarif contractuel",
              value: (
                <span className="flex flex-wrap items-center gap-1.5">
                  {formatEuros(price.cents)} HT/mois
                  {price.catalogDiffers && <Badge tone="info">catalogue actuel : {formatEuros(price.catalogCents)}</Badge>}
                </span>
              ),
              hint: price.source === "CATALOG_FALLBACK" ? "Repris de l'offre : aucun tarif contractuel figé sur cette fiche." : "Figé à la souscription ; seule une modification tracée le change.",
            },
            { label: "Début de l'abonnement", value: formatFrenchDate(subscription.createdAt) },
            { label: "Période d'essai", value: subscription.trialEndsAt ? `${subscription.trialStartsAt ? `du ${formatFrenchDate(subscription.trialStartsAt)} ` : ""}au ${formatFrenchDate(subscription.trialEndsAt)}` : "Aucune" },
            { label: "Période en cours", value: subscription.currentPeriodEnd ? `du ${formatFrenchDate(subscription.currentPeriodStart)} au ${formatFrenchDate(subscription.currentPeriodEnd)}` : `depuis le ${formatFrenchDate(subscription.currentPeriodStart)}` },
            { label: "Prochaine facture", value: subscription.nextInvoiceAt ? formatFrenchDate(subscription.nextInvoiceAt) : null },
            { label: "Dernier paiement", value: subscription.lastPaymentAt ? `${formatFrenchDate(subscription.lastPaymentAt)}${subscription.lastPaymentCents !== null ? ` · ${formatEuros(subscription.lastPaymentCents)}` : ""}` : "Aucun" },
            { label: "Dernier échec de paiement", value: subscription.lastPaymentFailedAt ? formatFrenchDate(subscription.lastPaymentFailedAt) : "Aucun" },
            { label: "Résiliation", value: subscription.canceledAt ? `Résilié le ${formatFrenchDate(subscription.canceledAt)}` : subscription.cancelAtPeriodEnd ? `Programmée${subscription.cancelAt ? ` au ${formatFrenchDate(subscription.cancelAt)}` : " en fin de période"}` : "Aucune" },
            { label: "Suspension", value: subscription.suspendedAt ? `Depuis le ${formatFrenchDate(subscription.suspendedAt)}` : "Aucune", hint: subscription.suspendedReason ? `Motif : ${subscription.suspendedReason}` : undefined },
            { label: "Stripe", value: subscription.stripeSubscriptionId ? "Relié" : "Non relié", hint: subscription.stripeSubscriptionId ?? undefined },
          ]}
        />
      </AdminSection>

      <AdminSection title="Historique du tarif contractuel" description="Chaque changement est explicite, motivé et tracé. Le catalogue n'en crée jamais." padded={data.priceChanges.length === 0}>
        {data.priceChanges.length === 0 ? (
          <EmptyLine>Aucun changement de tarif depuis la souscription.</EmptyLine>
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <TR>
                  <TH>Date d&apos;effet</TH>
                  <TH numeric>Avant</TH>
                  <TH numeric>Après</TH>
                  <TH>Motif</TH>
                  <TH>Stripe</TH>
                  <TH>Par</TH>
                </TR>
              </THead>
              <TBody>
                {data.priceChanges.map((c) => (
                  <TR key={c.id}>
                    <TD>{formatFrenchDate(c.effectiveAt)}</TD>
                    <TD numeric>{c.previousCents !== null ? formatEuros(c.previousCents) : "—"}</TD>
                    <TD numeric className="font-medium">{formatEuros(c.nextCents)}</TD>
                    <TD className="max-w-[24rem] whitespace-normal text-[13px] text-text-secondary">{c.reason}</TD>
                    <TD>{c.appliedToStripe ? <Badge tone="success">Appliqué</Badge> : <Badge tone="neutral">Fiche seule</Badge>}</TD>
                    <TD className="text-[13px] text-text-secondary">{c.by ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </AdminSection>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <AdminSection title="Demandes de résiliation" action={<Link href="/admin/resiliations" className="text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">Toutes les résiliations</Link>}>
          {data.cancellations.length === 0 ? (
            <EmptyLine>Aucune demande de résiliation.</EmptyLine>
          ) : (
            <ul className="-my-2 divide-y divide-border-subtle">
              {data.cancellations.map((c) => (
                <li key={c.id} className="space-y-1 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <CancellationStatusBadge status={c.status} />
                    <span className="text-[13px] font-medium text-text-primary">{CANCELLATION_REASONS[c.reason] ?? c.reason}</span>
                  </span>
                  <span className="block text-[12px] text-text-tertiary">
                    Reçue le {formatFrenchDate(c.requestedAt)} ({CANCELLATION_CHANNELS[c.channel] ?? c.channel})
                    {c.plannedEndAt ? ` · fin prévue le ${formatFrenchDate(c.plannedEndAt)}` : ""}
                    {c.stripeScheduled ? " · programmée chez Stripe" : ""}
                  </span>
                  {c.reasonDetail && <span className="block text-[12.5px] text-text-secondary">{c.reasonDetail}</span>}
                </li>
              ))}
            </ul>
          )}
        </AdminSection>

        <AdminSection title="Liens d'abonnement envoyés">
          {data.invites.length === 0 ? (
            <EmptyLine>Aucun lien d&apos;activation envoyé.</EmptyLine>
          ) : (
            <ul className="-my-2 divide-y divide-border-subtle">
              {data.invites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-text-primary">{inv.plan.name}</span>
                    <span className="block text-[12px] text-text-tertiary">
                      {inv.sentTo}
                      {inv.sentAt ? ` · envoyé le ${formatFrenchDate(inv.sentAt)}` : ""}
                      {inv.sentCount > 1 ? ` (${inv.sentCount} envois)` : ""}
                    </span>
                  </span>
                  {inv.completedAt ? <Badge tone="success">Souscrit</Badge> : inv.openedAt ? <Badge tone="brand">Ouvert</Badge> : inv.expiresAt < now ? <Badge tone="neutral">Expiré</Badge> : <Badge tone="info">Envoyé</Badge>}
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      </div>
    </div>
  );
}
