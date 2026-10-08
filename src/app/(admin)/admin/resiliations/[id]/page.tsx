import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCard, ShieldCheck } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { loadAllTemplates } from "@/server/services/admin/email-templates";
import { dayInParis, getCancellation } from "@/server/services/admin/billing-admin";
import { contractualPrice } from "@/core/billing/contract-price";
import { CANCELLATION_CHANNELS, CANCELLATION_REASONS, DISPATCH_TRIGGER_LABELS, isOpenCancellation } from "@/core/admin/statuses";
import { mergeTimeline, type TimelineEntry } from "@/core/admin/timeline";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { CancellationStatusBadge, SubscriptionStatusBadge } from "@/components/admin/status-badge";
import { ContactDialog } from "@/components/admin/contact-dialog";
import { Timeline } from "@/components/admin/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { DateText, StripeNotConfigured } from "../../abonnements/billing-ui";
import { CancellationJournalActions, CancellationStatusActions } from "./cancellation-actions";

export const metadata: Metadata = { title: "Demande de résiliation" };

/**
 * Une demande de résiliation : ce qui a été demandé, par quel canal, où elle
 * en est, et tout son historique (étapes, contacts, notes, e-mails). Les
 * gestes sont proposés selon le statut, chacun confirmé.
 */
export default async function CancellationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformSession();
  const { id } = await params;
  const found = await getCancellation(id);
  if (!found) notFound();
  const { request, emails, names } = found;
  const stripe = stripeConfigState();
  const sub = request.subscription;
  const open = isOpenCancellation(request.status);
  const suggestedEnd = sub?.currentPeriodEnd ?? null;

  // Les modèles d'accusé et de confirmation, pré-remplis des dates de la demande (que le
  // destinataire seul ne permet pas de connaître) : l'aperçu montre exactement ce qui part.
  const fill = (text: string) => text.replaceAll("{{date_demande}}", formatFrenchDate(request.requestedAt)).replaceAll("{{date_fin_prevue}}", request.plannedEndAt ? formatFrenchDate(request.plannedEndAt) : "{{date_fin_prevue}}");
  const templates = (await loadAllTemplates())
    .filter((t) => t.key === "cancellation.received" || (t.key === "cancellation.confirmed" && request.plannedEndAt))
    .map((t) => ({ ...t, text: { subject: fill(t.text.subject), title: fill(t.text.title), body: fill(t.text.body) } }));

  const timeline: TimelineEntry[] = mergeTimeline([
    request.events.map((e) => ({
      id: `evt:${e.id}`,
      at: e.createdAt,
      kind: e.type === "NOTE" ? ("note" as const) : e.type === "STRIPE_SCHEDULED" ? ("abonnement" as const) : ("resiliation" as const),
      title: e.type === "NOTE" ? "Note" : e.type === "CONTACT" ? "Contact avec le titulaire" : e.summary,
      detail: e.type === "NOTE" || e.type === "CONTACT" ? e.summary : null,
      actor: e.actorLabel ?? (e.actorAdminId ? names.get(e.actorAdminId) : null) ?? null,
      tone: e.toStatus === "CONFIRMED" ? ("danger" as const) : e.toStatus === "CANCELED" ? ("success" as const) : e.toStatus === "COMPLETED" ? ("neutral" as const) : e.type === "STRIPE_SCHEDULED" ? ("warning" as const) : ("info" as const),
    })),
    emails.map((m) => ({
      id: `mail:${m.id}`,
      at: m.createdAt,
      kind: "email" as const,
      title: m.subject ?? (m.templateKey === "cancellation.confirmed" ? "Confirmation de résiliation" : "Accusé de réception"),
      detail: `${m.status === "SENT" || m.status === "DELIVERED" ? "Envoyé" : m.status === "SIMULATED" ? "Non transmis (messagerie non configurée)" : `Statut : ${m.status}`} à ${m.recipient}${m.trigger ? ` · ${DISPATCH_TRIGGER_LABELS[m.trigger] ?? m.trigger}` : ""}`,
      actor: m.sentByAdminId ? (names.get(m.sentByAdminId) ?? null) : null,
      tone: m.status === "FAILED" || m.status === "BOUNCED" ? ("danger" as const) : m.status === "SIMULATED" ? ("warning" as const) : ("success" as const),
    })),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Finances", href: "/admin/abonnements" }}
        parent={{ label: "Résiliations", href: "/admin/resiliations" }}
        title={request.pharmacy.name}
        badge={<CancellationStatusBadge status={request.status} />}
        description={`Demande reçue le ${formatFrenchDate(request.requestedAt)} par ${(CANCELLATION_CHANNELS[request.channel] ?? request.channel).toLowerCase()} — ${CANCELLATION_REASONS[request.reason] ?? request.reason}.`}
        actions={
          <Button asChild variant="outline" size="sm" leadingIcon={<CreditCard className="size-4" />}>
            <Link href={`/admin/abonnements/${request.pharmacy.id}`}>Fiche abonnement</Link>
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface-card px-4 py-3 text-[13px] leading-5 text-text-secondary">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden="true" />
        <p>Une résiliation terminée ne coupe rien automatiquement et ne supprime aucune donnée. L&apos;arrêt chez Stripe et la suspension de l&apos;accès restent des gestes séparés et confirmés.</p>
      </div>
      {!stripe.configured && open && <StripeNotConfigured detail={stripe.detail}>La fin de l&apos;abonnement reste à faire chez Stripe ; rien n&apos;est simulé ici.</StripeNotConfigured>}
      {request.status === "CANCELED" && request.stripeScheduled && sub?.cancelAtPeriodEnd && (
        <Alert tone="warning" title="La fin reste programmée chez Stripe" action={<Button asChild size="sm" variant="outline"><Link href={`/admin/abonnements/${request.pharmacy.id}`}>Annuler la fin</Link></Button>}>
          La demande est annulée mais l&apos;abonnement Stripe s&apos;arrêtera toujours à la fin de la période. Annulez la fin programmée depuis la fiche abonnement.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <AdminSection title="Demande">
            <FactList
              items={[
                { label: "Motif", value: CANCELLATION_REASONS[request.reason] ?? request.reason },
                { label: "Reçue par", value: CANCELLATION_CHANNELS[request.channel] ?? request.channel },
                { label: "Date de la demande", value: <DateText date={request.requestedAt} /> },
                { label: "Fin prévue", value: request.plannedEndAt ? formatFrenchDate(request.plannedEndAt) : suggestedEnd && open ? <span className="text-text-secondary">Non fixée — suggérée : {formatFrenchDate(suggestedEnd)}</span> : "Non fixée" },
                { label: "Confirmée le", value: <DateText date={request.confirmedAt} /> },
                { label: request.status === "CANCELED" ? "Annulée le" : "Terminée le", value: <DateText date={request.status === "CANCELED" ? request.canceledAt : request.completedAt} /> },
                { label: "Dernier contact", value: <DateText date={request.lastContactAt} fallback="Aucun" /> },
                { label: "Fin chez Stripe", value: request.stripeScheduled ? <Badge tone="info">Programmée</Badge> : <Badge tone="neutral">Non programmée</Badge> },
                { label: "Enregistrée par", value: request.createdByAdminId ? (names.get(request.createdByAdminId) ?? "—") : "—", hint: `le ${formatFrenchDate(request.createdAt)}` },
              ]}
            />
            {request.reasonDetail && (
              <div className="mt-4 rounded-xl bg-surface-sunken px-4 py-3">
                <p className="text-[12px] font-medium text-text-tertiary">Précisions (interne)</p>
                <p className="mt-0.5 text-[13.5px] leading-6 whitespace-pre-line text-text-primary">{request.reasonDetail}</p>
              </div>
            )}
          </AdminSection>

          <AdminSection title="Historique" description="Étapes, contacts, notes et e-mails de cette demande." action={<CancellationJournalActions requestId={request.id} />}>
            <Timeline entries={timeline} emptyText="Aucun événement pour l'instant." />
          </AdminSection>
        </div>

        <div className="min-w-0 space-y-5">
          <AdminSection title="Gestes" description="Proposés selon le statut, chacun confirmé et tracé.">
            <CancellationStatusActions
              requestId={request.id}
              status={request.status}
              plannedEndAt={dayInParis(request.plannedEndAt)}
              suggestedEndAt={dayInParis(suggestedEnd)}
              stripeScheduled={request.stripeScheduled}
              stripeConfigured={stripe.configured}
              stripeLinked={Boolean(sub?.stripeSubscriptionId)}
              periodEndLabel={sub?.currentPeriodEnd ? formatFrenchDate(sub.currentPeriodEnd) : null}
            />
          </AdminSection>

          <AdminSection title="Abonnement" action={<Button asChild variant="ghost" size="sm"><Link href={`/admin/abonnements/${request.pharmacy.id}`}>Ouvrir</Link></Button>}>
            {sub ? (
              <FactList
                className="sm:grid-cols-1"
                items={[
                  { label: "Offre", value: sub.plan.name },
                  { label: "Statut", value: <div className="flex flex-wrap gap-1"><SubscriptionStatusBadge status={sub.status} />{sub.cancelAtPeriodEnd && <Badge tone="warning">Fin programmée</Badge>}</div> },
                  { label: "Tarif contractuel", value: `${formatEuros(contractualPrice(sub, sub.plan).cents)} HT/mois` },
                  { label: "Fin de la période en cours", value: <DateText date={sub.currentPeriodEnd} /> },
                  ...(sub.cancelAt ? [{ label: "Fin programmée chez Stripe", value: formatFrenchDate(sub.cancelAt) }] : []),
                ]}
              />
            ) : (
              <p className="text-[13px] text-text-secondary">Aucun abonnement rattaché à cette officine.</p>
            )}
          </AdminSection>

          <AdminSection title="E-mails au titulaire">
            <p className="text-[13px] leading-5 text-text-secondary">
              {templates.length === 0
                ? "Aucun modèle disponible."
                : request.plannedEndAt
                  ? "L'accusé de réception et la confirmation sont pré-remplis avec les dates de la demande ; l'aperçu montre exactement ce qui part."
                  : "L'accusé de réception est pré-rempli avec la date de la demande. La confirmation sera proposée une fois la date de fin fixée."}
            </p>
            {templates.length > 0 && (
              <div className="mt-3">
                <ContactDialog pharmacyId={request.pharmacy.id} templates={templates} defaultTemplateKey={request.status === "CONFIRMED" && request.plannedEndAt ? "cancellation.confirmed" : "cancellation.received"} label={request.status === "CONFIRMED" && request.plannedEndAt ? "Envoyer la confirmation" : "Envoyer l'accusé de réception"} />
              </div>
            )}
          </AdminSection>
        </div>
      </div>
    </div>
  );
}
