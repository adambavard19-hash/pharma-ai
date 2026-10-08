import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, ExternalLink, FileText, History, ReceiptText } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { SIGNED_CONTRACT_STATUS, getPharmacyBilling, inviteTerms } from "@/server/billing/subscriptions";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { loadAllTemplates } from "@/server/services/admin/email-templates";
import { dayInParis, getSubscriptionDetail, paymentState, priceGap } from "@/server/services/admin/billing-admin";
import { contractualPrice } from "@/core/billing/contract-price";
import { contractStage, formatEuros, formatFrenchDate, subscriptionStage, type SubscriptionStatusCode } from "@/core/billing/subscription";
import { CANCELLATION_REASONS, CANCELLATION_STATUS_LABELS, isOpenCancellation, type CancellationStatusCode } from "@/core/admin/statuses";
import { CONTRACT_STATUS_LABELS, type ContractStatusCode } from "@/core/sales/pipeline";
import { mergeTimeline, type TimelineEntry } from "@/core/admin/timeline";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { CancellationStatusBadge, PaymentStatusBadge, StatusBadge } from "@/components/admin/status-badge";
import { ContactDialog } from "@/components/admin/contact-dialog";
import { RemindContractButton } from "@/components/admin/remind-contract-button";
import { Timeline } from "@/components/admin/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from "@/components/ui/table";
import { SubscriptionAdminActions } from "../billing-actions";
import { PrepareContractButton, SendContractButton } from "../contract-actions";
import { DateText, StatusWithDetail, StripeNotConfigured, formatDateTimeParis } from "../billing-ui";
import { ChangeContractPriceButton } from "./price-editor";
import { CreateCancellationButton } from "../../resiliations/create-cancellation";

export const metadata: Metadata = { title: "Abonnement de l'officine" };

const ENDED = new Set(["CANCELED", "INCOMPLETE_EXPIRED"]);

/**
 * La fiche abonnement d'une officine : l'abonnement, le tarif contractuel et
 * son historique, les gestes administratifs (tous confirmés), la résiliation,
 * les contrats, les paiements, et la frise de tout ce qui s'est passé.
 */
export default async function SubscriptionDetailPage({ params }: { params: Promise<{ pharmacyId: string }> }) {
  await requirePlatformSession();
  const { pharmacyId } = await params;
  const row = await getPharmacyBilling(pharmacyId);
  if (!row) notFound();

  const [detail, plans, templates] = await Promise.all([
    getSubscriptionDetail(row.id, row.organizationId),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, monthlyPriceCents: true, trialDays: true, isDefault: true } }),
    loadAllTemplates(),
  ]);
  const stripe = stripeConfigState();
  const sub = detail.subscription;
  const owner = row.memberships[0]?.user ?? null;
  const status = (sub?.status as SubscriptionStatusCode | undefined) ?? null;
  const latestInvite = detail.invites[0] ?? null;
  const stage = subscriptionStage({ status, inviteSentAt: latestInvite?.sentAt && !latestInvite.completedAt ? latestInvite.sentAt : null, suspendedAt: sub?.suspendedAt ?? null });
  const ongoing = Boolean(sub && !ENDED.has(sub.status));
  const price = sub ? contractualPrice(sub, sub.plan) : null;
  const gap = sub && price ? priceGap(price.cents, sub.plan.monthlyPriceCents) : null;
  const payment = sub ? paymentState({ status: sub.status, lastPaymentAt: sub.lastPaymentAt, lastPaymentCents: sub.lastPaymentCents, lastPaymentFailedAt: sub.lastPaymentFailedAt }) : null;
  const openCancellation = detail.cancellations.find((c) => isOpenCancellation(c.status)) ?? null;
  const latestContract = detail.contracts[0] ?? null;
  const foundingContract = sub?.contractId ? detail.contracts.find((c) => c.id === sub.contractId) ?? null : null;

  // Ce que proposerait le lien d'activation (même règle que sendSubscriptionInviteAction) :
  //   - dernier contrat SIGNÉ : son offre, à son tarif et avec son essai, tels qu'imprimés ;
  //   - contrat non signé : son offre si elle est active, sinon l'offre par défaut, au tarif et à l'essai catalogue.
  let inviteSummary: string | null = null;
  if (!sub?.stripeSubscriptionId || !ongoing) {
    if (latestContract?.planId && latestContract.status === SIGNED_CONTRACT_STATUS) {
      const contractPlan = plans.find((p) => p.id === latestContract.planId);
      // Mêmes conditions que celles que facturera le lien (inviteTerms) : tarif et essai du contrat.
      const terms = contractPlan ? inviteTerms(contractPlan, latestContract) : null;
      inviteSummary = contractPlan && terms
        ? `Offre ${contractPlan.name} au tarif du contrat v${latestContract.version} signé : ${formatEuros(terms.monthlyPriceCents)} HT/mois${terms.trialDays ? `, ${terms.trialDays} jours offerts` : ""}.`
        : `L'offre du contrat v${latestContract.version} est archivée : le lien ne pourra pas être créé.`;
    } else {
      const offer = (latestContract?.planId ? plans.find((p) => p.id === latestContract.planId) : undefined) ?? plans[0];
      if (offer) {
        const terms = inviteTerms(offer, null);
        inviteSummary = `Offre ${offer.name} au tarif catalogue : ${formatEuros(terms.monthlyPriceCents)} HT/mois${terms.trialDays ? `, ${terms.trialDays} jours offerts` : ""}.`;
        if (latestContract) inviteSummary += ` Contrat v${latestContract.version} non signé : tarif catalogue.`;
      }
    }
    if (inviteSummary && latestInvite?.sentAt && !latestInvite.completedAt) inviteSummary += ` Dernier lien envoyé le ${formatFrenchDate(latestInvite.sentAt)} à ${latestInvite.sentTo}.`;
  }

  const timeline: TimelineEntry[] = mergeTimeline([
    detail.billingEvents.map((e) => ({ id: `stripe:${e.id}`, at: e.receivedAt, kind: e.type.startsWith("invoice.") ? ("paiement" as const) : ("abonnement" as const), title: e.summary, detail: e.error ? `Erreur de traitement : ${e.error}` : null, actor: "Stripe", tone: e.error ? ("danger" as const) : e.type.includes("failed") ? ("warning" as const) : ("neutral" as const) })),
    (sub?.priceChanges ?? []).map((c) => ({
      id: `tarif:${c.id}`,
      at: c.createdAt,
      kind: "tarif" as const,
      title: `Tarif contractuel : ${c.previousCents !== null ? `${formatEuros(c.previousCents)} → ` : ""}${formatEuros(c.nextCents)} HT/mois`,
      detail: `${c.reason} — ${c.appliedToStripe ? `appliqué chez Stripe à l'échéance du ${formatFrenchDate(c.effectiveAt)}` : "fiche seulement (aucun abonnement Stripe)"}`,
      actor: c.changedByAdminId ? (detail.names.get(c.changedByAdminId) ?? null) : null,
      tone: "brand" as const,
    })),
    detail.cancellations.flatMap((r) => r.events.map((e) => ({ id: `resiliation:${e.id}`, at: e.createdAt, kind: "resiliation" as const, title: e.summary, actor: e.actorLabel, tone: e.toStatus === "CONFIRMED" ? ("danger" as const) : e.toStatus === "CANCELED" ? ("success" as const) : ("warning" as const), href: `/admin/resiliations/${r.id}` }))),
    detail.invites.filter((i) => i.sentAt).map((i) => ({ id: `lien:${i.id}`, at: i.sentAt!, kind: "abonnement" as const, title: `Lien d'activation (${i.plan.name}) envoyé à ${i.sentTo}${i.sentCount > 1 ? ` — ${i.sentCount} envois` : ""}`, detail: [i.openedAt ? `ouvert le ${formatFrenchDate(i.openedAt)}` : "pas encore ouvert", i.completedAt ? `abonnement activé le ${formatFrenchDate(i.completedAt)}` : null].filter(Boolean).join(" · "), tone: i.completedAt ? ("success" as const) : ("info" as const) })),
    detail.accessAudits.map((a) => {
      const meta = (a.metadata ?? {}) as { reason?: string | null; statusNote?: string | null };
      const labels: Record<string, { title: string; kind: "acces" | "abonnement"; tone: "danger" | "success" | "warning" | "info" }> = {
        "billing.access_suspended": { title: "Accès suspendu", kind: "acces", tone: "danger" },
        "billing.access_restored": { title: "Accès rétabli", kind: "acces", tone: "success" },
        "billing.cancel_scheduled": { title: "Résiliation programmée chez Stripe en fin de période", kind: "abonnement", tone: "warning" },
        "billing.cancel_revoked": { title: "Résiliation programmée annulée", kind: "abonnement", tone: "info" },
      };
      const label = labels[a.action] ?? { title: a.action, kind: "abonnement" as const, tone: "info" as const };
      // Au rétablissement, le statut retenu et d'où il vient (Stripe, statut d'avant la suspension, défaut).
      const detailText = [meta.reason ? `Motif : ${meta.reason}` : null, meta.statusNote ?? null].filter(Boolean).join(" — ") || null;
      return { id: `audit:${a.id}`, at: a.createdAt, kind: label.kind, title: label.title, detail: detailText, actor: a.platformAdminId ? (detail.names.get(a.platformAdminId) ?? null) : null, tone: label.tone };
    }),
  ]);

  const pharmacyOption = { id: row.id, name: row.name, city: row.city, hasOpenRequest: Boolean(openCancellation), hasSubscription: Boolean(sub), suggestedEndAt: ongoing ? dayInParis(sub?.currentPeriodEnd) : null };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Finances", href: "/admin/abonnements" }}
        parent={{ label: "Abonnements", href: "/admin/abonnements" }}
        title={row.name}
        badge={<StatusBadge status={stage} />}
        description={[row.city, owner ? `Titulaire : ${owner.firstName} ${owner.lastName} — ${owner.email}` : "Aucun titulaire actif"].filter(Boolean).join(" · ")}
        actions={
          <>
            <ContactDialog pharmacyId={row.id} templates={templates} audience="Titulaire" />
            <Button asChild variant="outline" size="sm" leadingIcon={<Building2 className="size-4" />}>
              <Link href={`/admin/pharmacies/${row.id}`}>Fiche officine</Link>
            </Button>
          </>
        }
      />

      {!stripe.configured && <StripeNotConfigured detail={stripe.detail} />}
      {!row.isActive && (
        <Alert tone="danger" title="Accès suspendu">
          L&apos;officine ne peut plus se connecter{sub?.suspendedReason ? ` — motif : ${sub.suspendedReason}` : ""}. L&apos;abonnement Stripe n&apos;est pas modifié par la suspension.
        </Alert>
      )}
      {openCancellation && (
        <Alert tone="warning" title={`Résiliation : ${CANCELLATION_STATUS_LABELS[openCancellation.status as CancellationStatusCode]?.label ?? openCancellation.status}`} action={<Button asChild size="sm" variant="outline"><Link href={`/admin/resiliations/${openCancellation.id}`}>Ouvrir la demande</Link></Button>}>
          Demande reçue le {formatFrenchDate(openCancellation.requestedAt)} — motif : {CANCELLATION_REASONS[openCancellation.reason] ?? openCancellation.reason}
          {openCancellation.plannedEndAt ? `. Fin prévue le ${formatFrenchDate(openCancellation.plannedEndAt)}.` : "."}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <AdminSection title="Abonnement" description={sub ? `Offre ${sub.plan.name}` : "Aucun abonnement rattaché pour l'instant."}>
            {sub ? (
              <FactList
                items={[
                  { label: "Statut", value: <div className="flex flex-wrap gap-1"><StatusBadge status={stage} />{sub.cancelAtPeriodEnd && <Badge tone="warning">Fin programmée</Badge>}</div> },
                  { label: "Paiement", value: payment ? <StatusWithDetail status={payment} detail={payment.detail} /> : null },
                  { label: "Début", value: <DateText date={sub.trialStartsAt ?? sub.createdAt} /> },
                  { label: "Essai", value: sub.trialEndsAt ? `jusqu'au ${formatFrenchDate(sub.trialEndsAt)}` : "Aucun" },
                  { label: "Période en cours", value: `${formatFrenchDate(sub.currentPeriodStart)}${sub.currentPeriodEnd ? ` → ${formatFrenchDate(sub.currentPeriodEnd)}` : ""}` },
                  { label: "Prochaine échéance", value: sub.nextInvoiceAt && sub.status !== "CANCELED" ? formatFrenchDate(sub.nextInvoiceAt) : "—" },
                  { label: "Dernier paiement réussi", value: sub.lastPaymentAt ? `${sub.lastPaymentCents ? `${formatEuros(sub.lastPaymentCents)} ` : ""}le ${formatFrenchDate(sub.lastPaymentAt)}` : "Aucun" },
                  { label: "Dernier échec", value: sub.lastPaymentFailedAt ? formatDateTimeParis(sub.lastPaymentFailedAt) : "Aucun" },
                  ...(sub.cancelAt ? [{ label: "Fin programmée", value: formatFrenchDate(sub.cancelAt) }] : []),
                  ...(sub.canceledAt ? [{ label: "Résilié le", value: formatFrenchDate(sub.canceledAt) }] : []),
                  { label: "Facturation", value: sub.stripeSubscriptionId ? "Abonnement Stripe rattaché" : "Aucun abonnement Stripe rattaché", hint: sub.stripeSubscriptionId ? undefined : "Les gestes Stripe ne s'appliquent pas." },
                ]}
              />
            ) : (
              <p className="text-[13.5px] leading-6 text-text-secondary">
                {latestInvite?.sentAt
                  ? `Lien d'activation envoyé à ${latestInvite.sentTo} le ${formatFrenchDate(latestInvite.sentAt)}${latestInvite.openedAt ? `, ouvert le ${formatFrenchDate(latestInvite.openedAt)}` : ", pas encore ouvert"}.`
                  : "Aucun lien d'activation envoyé. Préparez et faites signer le contrat, puis envoyez le lien depuis le panneau « Gestes »."}
              </p>
            )}
          </AdminSection>

          <AdminSection
            title="Tarif"
            description="Le tarif contractuel de cette officine, figé à la souscription. Le catalogue ne le change jamais."
            action={sub && ongoing && price ? <ChangeContractPriceButton subscriptionId={sub.id} currentCents={price.cents} catalogCents={sub.plan.monthlyPriceCents} stripeLinked={Boolean(sub.stripeSubscriptionId)} stripeConfigured={stripe.configured} nextInvoiceLabel={sub.nextInvoiceAt ? formatFrenchDate(sub.nextInvoiceAt) : sub.currentPeriodEnd ? formatFrenchDate(sub.currentPeriodEnd) : null} /> : undefined}
          >
            {sub && price && gap ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-800/60 dark:bg-brand-950/30">
                    <p className="text-[12.5px] font-medium text-text-secondary">Tarif contractuel</p>
                    <p className="mt-1 text-[24px] leading-8 font-semibold tracking-[-0.02em] text-brand-800 tabular-nums dark:text-brand-200">{formatEuros(price.cents)}</p>
                    <p className="text-[12px] text-text-tertiary">HT par mois</p>
                    <div className="mt-2">{price.source === "CONTRACT" ? <Badge tone="success">Figé</Badge> : <Badge tone="warning">Non figé — tarif catalogue</Badge>}</div>
                  </div>
                  <div className="rounded-xl border border-border-subtle p-4">
                    <p className="text-[12.5px] font-medium text-text-secondary">Catalogue actuel de l&apos;offre</p>
                    <p className="mt-1 text-[24px] leading-8 font-semibold tracking-[-0.02em] text-text-primary tabular-nums">{formatEuros(sub.plan.monthlyPriceCents)}</p>
                    <p className="text-[12px] text-text-tertiary">{sub.plan.name} — pour les nouveaux abonnements</p>
                  </div>
                  <div className="rounded-xl border border-border-subtle p-4">
                    <p className="text-[12.5px] font-medium text-text-secondary">Écart</p>
                    <p className={`mt-1 text-[24px] leading-8 font-semibold tracking-[-0.02em] tabular-nums ${gap.diffCents === 0 ? "text-text-primary" : gap.diffCents < 0 ? "text-info-700 dark:text-info-500" : "text-warning-700 dark:text-warning-500"}`}>
                      {gap.diffCents === 0 ? "Aucun" : `${gap.diffCents > 0 ? "+" : "−"}${formatEuros(Math.abs(gap.diffCents))}`}
                    </p>
                    <p className="text-[12px] text-text-tertiary">{gap.diffCents === 0 ? "Identique au catalogue" : `${gap.percent !== null ? `${gap.percent > 0 ? "+" : ""}${String(gap.percent).replace(".", ",")} % ` : ""}par rapport au catalogue`}</p>
                  </div>
                </div>
                {price.source === "CATALOG_FALLBACK" && (
                  <p className="text-[12.5px] leading-5 text-text-secondary">
                    Ce tarif n&apos;a pas encore été figé : l&apos;offre actuelle sert de référence. Il le sera à la prochaine synchronisation avec Stripe, ou par une modification explicite.
                  </p>
                )}
                {foundingContract && (
                  <p className="text-[12.5px] text-text-secondary">
                    Contrat d&apos;origine : version {foundingContract.version}, {formatEuros(foundingContract.monthlyPriceCents)} HT/mois.
                  </p>
                )}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold tracking-[0.03em] text-text-tertiary uppercase">
                    <History className="size-3.5" aria-hidden="true" /> Historique des changements
                  </p>
                  {sub.priceChanges.length === 0 ? (
                    <p className="text-[13px] text-text-tertiary">Aucun changement de tarif depuis la souscription.</p>
                  ) : (
                    <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
                      {sub.priceChanges.map((c) => (
                        <li key={c.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-[13.5px] font-medium text-text-primary tabular-nums">
                              {c.previousCents !== null ? `${formatEuros(c.previousCents)} → ` : ""}
                              {formatEuros(c.nextCents)} HT/mois
                            </p>
                            <p className="text-[12.5px] text-text-secondary">{c.reason}</p>
                            <p className="text-[12px] text-text-tertiary">
                              {formatDateTimeParis(c.createdAt)}
                              {c.changedByAdminId ? ` · ${detail.names.get(c.changedByAdminId) ?? "administrateur"}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0">{c.appliedToStripe ? <Badge tone="success">Stripe — dès le {formatFrenchDate(c.effectiveAt)}</Badge> : <Badge tone="neutral">Fiche seulement</Badge>}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[13.5px] leading-6 text-text-secondary">Pas encore d&apos;abonnement : le tarif contractuel sera figé à la souscription — celui du contrat signé, sinon celui de l&apos;offre du moment.</p>
            )}
          </AdminSection>

          <AdminSection title="Paiements" description="Les factures reçues de Stripe pour cette officine." padded={false} action={<Button asChild variant="ghost" size="sm" leadingIcon={<ReceiptText className="size-4" />}><Link href="/admin/paiements">Tous les paiements</Link></Button>}>
            {!sub || sub.payments.length === 0 ? (
              <p className="px-5 py-6 text-center text-[13.5px] text-text-tertiary">Aucune facture reçue pour l&apos;instant.</p>
            ) : (
              <TableWrapper className="rounded-none border-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH numeric>Montant</TH>
                      <TH>Statut</TH>
                      <TH>Période</TH>
                      <TH numeric>Tentatives</TH>
                      <TH>Facture</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {sub.payments.map((p) => (
                      <TR key={p.id}>
                        <TD><DateText date={p.paidAt ?? p.failedAt ?? p.createdAt} /></TD>
                        <TD numeric className="font-medium">{formatEuros(p.amountCents)}</TD>
                        <TD><PaymentStatusBadge status={p.status} /></TD>
                        <TD className="text-text-secondary">{p.periodStart && p.periodEnd ? `${formatFrenchDate(p.periodStart)} → ${formatFrenchDate(p.periodEnd)}` : "—"}</TD>
                        <TD numeric>{p.attemptCount || "—"}</TD>
                        <TD>
                          <div className="flex gap-3 text-[13px]">
                            {p.hostedInvoiceUrl && <a href={p.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300">Voir <ExternalLink className="size-3" aria-hidden="true" /></a>}
                            {p.invoicePdfUrl && <a href={p.invoicePdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300">PDF <ExternalLink className="size-3" aria-hidden="true" /></a>}
                            {!p.hostedInvoiceUrl && !p.invoicePdfUrl && <span className="text-text-tertiary">—</span>}
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            )}
          </AdminSection>

          <AdminSection title="Historique" description="Stripe, tarif, liens d'activation, accès et résiliation, du plus récent au plus ancien.">
            <Timeline entries={timeline} emptyText="Aucun événement pour l'instant." />
          </AdminSection>
        </div>

        <div className="min-w-0 space-y-5">
          <AdminSection title="Gestes" description="Chaque geste est confirmé et tracé au journal d'audit.">
            <SubscriptionAdminActions
              pharmacyId={row.id}
              pharmacyName={row.name}
              stripeConfigured={stripe.configured}
              hasStripeSubscription={Boolean(sub?.stripeSubscriptionId)}
              subscriptionOngoing={ongoing}
              cancelAtPeriodEnd={sub?.cancelAtPeriodEnd ?? false}
              periodEndLabel={sub?.currentPeriodEnd ? formatFrenchDate(sub.currentPeriodEnd) : null}
              isActive={row.isActive}
              inviteSummary={inviteSummary}
            />
          </AdminSection>

          <AdminSection title="Résiliation" description="Les demandes de résiliation de cette officine. Rien n'est jamais coupé automatiquement.">
            <div className="space-y-3">
              {detail.cancellations.length === 0 ? (
                <p className="text-[13px] text-text-tertiary">Aucune demande de résiliation.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.cancellations.map((c) => (
                    <li key={c.id}>
                      <Link href={`/admin/resiliations/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2 transition-colors hover:border-brand-300 hover:bg-surface-sunken">
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-text-primary">Demande du {formatFrenchDate(c.requestedAt)}</span>
                          <span className="block truncate text-[12px] text-text-tertiary">{CANCELLATION_REASONS[c.reason] ?? c.reason}</span>
                        </span>
                        <CancellationStatusBadge status={c.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {!openCancellation && <CreateCancellationButton fixedPharmacy={pharmacyOption} label="Enregistrer une demande" />}
            </div>
          </AdminSection>

          <AdminSection title="Contrats" description="Chaque version, son statut et son PDF." action={<Button asChild variant="ghost" size="sm"><Link href={`/admin/contrats?q=${encodeURIComponent(row.name)}`}>Tous</Link></Button>}>
            <div className="space-y-3">
              {detail.contracts.length === 0 ? (
                <p className="text-[13px] text-text-tertiary">Aucun contrat préparé.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.contracts.map((c) => (
                    <li key={c.id} className="rounded-lg border border-border-subtle px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-text-primary">Version {c.version}</span>
                        <Badge tone={contractStage({ status: c.status }).tone}>{CONTRACT_STATUS_LABELS[c.status as ContractStatusCode] ?? c.status}</Badge>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-text-secondary">
                        {c.plan?.name ?? "Offre non précisée"} · {formatEuros(c.monthlyPriceCents)} HT/mois · {c.durationMonths} mois
                      </p>
                      <p className="text-[12px] text-text-tertiary">{[c.sentAt ? `envoyé le ${formatFrenchDate(c.sentAt)}` : null, c.finalizedAt ? `signé le ${formatFrenchDate(c.finalizedAt)}` : null, c.refusedAt ? `refusé le ${formatFrenchDate(c.refusedAt)}` : null].filter(Boolean).join(" · ") || `créé le ${formatFrenchDate(c.createdAt)}`}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button asChild size="sm" variant="ghost" leadingIcon={<FileText className="size-3.5" />}>
                          <a href={`/api/contrats/apercu/${c.id}`} target="_blank" rel="noreferrer">PDF</a>
                        </Button>
                        {c.id === latestContract?.id && ["DRAFT", "SENT", "OPENED"].includes(c.status) && <SendContractButton pharmacyId={row.id} contractId={c.id} status={c.status} signerEmail={c.pharmacySignerEmail} />}
                        {c.id === latestContract?.id && ["SENT", "OPENED"].includes(c.status) && <RemindContractButton contractId={c.id} signerEmail={c.pharmacySignerEmail} reminderCount={c.reminderCount} variant="outline" />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {(!latestContract || latestContract.status === "REFUSED" || latestContract.status === "EXPIRED") && (
                <PrepareContractButton pharmacyId={row.id} plans={plans} variant={latestContract ? "outline" : "primary"} />
              )}
              {plans.length === 0 && <p className="text-[12px] text-text-tertiary">Aucune offre active : créez-en une dans Offres & tarifs.</p>}
            </div>
          </AdminSection>
        </div>
      </div>
    </div>
  );
}
