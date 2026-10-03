import Link from "next/link";
import { Pin } from "lucide-react";
import { loadOverviewExtras, type Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import { AdminSection, FactList } from "@/components/admin/page-header";
import { PaymentStatusBadge, StatusBadge, SubscriptionStatusBadge } from "@/components/admin/status-badge";
import { Timeline } from "@/components/admin/timeline";
import { Badge } from "@/components/ui/badge";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { lgoLabel } from "@/core/stock/connectors";
import { ORIGIN_LABELS } from "@/core/contracts/journey";
import { PROSPECT_STATUS_LABELS, PROSPECT_STATUS_TONES, type ProspectStatusCode } from "@/core/sales/pipeline";
import { pharmacyStatusLabel, truncate } from "@/core/admin/clients";
import { formatDateTime } from "@/lib/format";
import { EditPharmacyButton } from "../pharmacy-form";
import { When } from "../client-ui";
import { AddNoteButton } from "./notes";
import { ContractPdfLink, ContractStatusBadge, EmptyLine, MoreLink, tabHref } from "./shared";

/** L'aperçu : l'essentiel de chaque onglet, en une page. */
export async function OverviewTab({ base, now }: { base: Pharmacy360; now: Date }) {
  const { pharmacy, subscription, price, latestContract, owner } = base;
  const extras = await loadOverviewExtras(base, now);
  const address = [pharmacy.addressLine1, pharmacy.addressLine2, [pharmacy.postalCode, pharmacy.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const prospect = pharmacy.prospect;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-3">
      <AdminSection
        className="lg:col-span-2"
        title="Identité"
        description="L'officine et son titulaire."
        action={
          <EditPharmacyButton
            pharmacyId={pharmacy.id}
            initial={{
              name: pharmacy.name,
              email: pharmacy.email ?? "",
              phone: pharmacy.phone ?? "",
              addressLine1: pharmacy.addressLine1 ?? "",
              postalCode: pharmacy.postalCode ?? "",
              city: pharmacy.city ?? "",
              finessNumber: pharmacy.finessNumber ?? "",
              siret: pharmacy.siret ?? "",
              brandColor: pharmacy.brandColor,
              postCount: pharmacy.postCount ? String(pharmacy.postCount) : "",
            }}
          />
        }
      >
        <FactList
          items={[
            { label: "Nom", value: pharmacy.name, hint: pharmacy.organization.name !== pharmacy.name ? `Organisation : ${pharmacy.organization.name}` : undefined },
            { label: "Titulaire", value: owner ? `${owner.user.firstName} ${owner.user.lastName.toUpperCase()}` : <Badge tone="warning">Aucun titulaire</Badge>, hint: owner?.user.email },
            { label: "SIRET", value: pharmacy.siret, hint: pharmacy.finessNumber ? `FINESS ${pharmacy.finessNumber}` : undefined },
            { label: "Adresse", value: address || null },
            { label: "Téléphone", value: pharmacy.phone },
            { label: "E-mail de contact", value: pharmacy.email },
            { label: "Statut", value: <StatusBadge status={pharmacyStatusLabel(pharmacy)} /> },
            { label: "Postes de comptoir déclarés", value: pharmacy.postCount ?? "Non renseigné" },
          ]}
        />
      </AdminSection>

      <AdminSection title="Abonnement" action={<MoreLink href={tabHref(pharmacy.id, "abonnement")}>Détail</MoreLink>}>
        {subscription && price ? (
          <FactList
            className="sm:grid-cols-1"
            items={[
              { label: "Offre", value: subscription.plan.name },
              {
                label: "Tarif contractuel",
                value: (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {formatEuros(price.cents)} HT/mois
                    {price.catalogDiffers && <Badge tone="info">catalogue actuel : {formatEuros(price.catalogCents)}</Badge>}
                  </span>
                ),
                hint: price.source === "CATALOG_FALLBACK" ? "Repris de l'offre : aucun tarif contractuel figé sur cette fiche." : undefined,
              },
              { label: "Statut", value: <SubscriptionStatusBadge status={subscription.status} /> },
              { label: "Début", value: formatFrenchDate(subscription.createdAt) },
              { label: "Période d'essai", value: subscription.trialEndsAt ? `${subscription.trialStartsAt ? `du ${formatFrenchDate(subscription.trialStartsAt)} ` : ""}au ${formatFrenchDate(subscription.trialEndsAt)}` : "Aucune" },
              { label: "Prochaine échéance", value: subscription.nextInvoiceAt ? formatFrenchDate(subscription.nextInvoiceAt) : subscription.currentPeriodEnd ? formatFrenchDate(subscription.currentPeriodEnd) : null, hint: subscription.cancelAtPeriodEnd ? "Résiliation programmée à cette date" : undefined },
            ]}
          />
        ) : (
          <EmptyLine>Aucun abonnement pour l&apos;instant.</EmptyLine>
        )}
      </AdminSection>

      <AdminSection title="Dernier contrat" action={<MoreLink href={tabHref(pharmacy.id, "contrats")}>Tous les contrats</MoreLink>}>
        {latestContract ? (
          <FactList
            className="sm:grid-cols-1"
            items={[
              { label: "Statut", value: <ContractStatusBadge status={latestContract.status} />, hint: `Version ${latestContract.version}${latestContract.reference ? ` · ${latestContract.reference}` : ""}` },
              { label: "Envoyé", value: latestContract.sentAt ? formatFrenchDate(latestContract.sentAt) : "Pas encore envoyé", hint: latestContract.sentAt ? `À ${latestContract.pharmacySignerEmail}` : undefined },
              { label: "Signé", value: latestContract.finalizedAt ? formatFrenchDate(latestContract.finalizedAt) : latestContract.pharmacySignedAt ? `Par l'officine le ${formatFrenchDate(latestContract.pharmacySignedAt)}` : "Non signé" },
              { label: "Document", value: <ContractPdfLink contractId={latestContract.id} /> },
            ]}
          />
        ) : (
          <EmptyLine>Aucun contrat pour l&apos;instant.</EmptyLine>
        )}
      </AdminSection>

      <AdminSection title="Derniers paiements" action={<MoreLink href={tabHref(pharmacy.id, "paiements")}>Tous les paiements</MoreLink>}>
        {extras.payments.length === 0 ? (
          <EmptyLine>Aucun paiement reçu de Stripe.</EmptyLine>
        ) : (
          <ul className="-my-2 divide-y divide-border-subtle">
            {extras.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium tabular-nums text-text-primary">{formatEuros(p.amountCents)}</span>
                  <span className="block text-[12px] text-text-tertiary">{formatFrenchDate(p.paidAt ?? p.failedAt ?? p.createdAt)}</span>
                </span>
                <PaymentStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection title="Commercial" action={<MoreLink href={tabHref(pharmacy.id, "commercial")}>Dossier</MoreLink>}>
        {prospect ? (
          <FactList
            className="sm:grid-cols-1"
            items={[
              { label: "Étape", value: <StatusBadge status={{ label: PROSPECT_STATUS_LABELS[prospect.status as ProspectStatusCode] ?? prospect.status, tone: PROSPECT_STATUS_TONES[prospect.status as ProspectStatusCode] ?? "neutral" }} /> },
              { label: "Commercial responsable", value: prospect.salesRep ? `${prospect.salesRep.firstName} ${prospect.salesRep.lastName}` : "Tenu par la console" },
              { label: "Origine", value: ORIGIN_LABELS[prospect.origin] ?? prospect.origin },
              { label: "Démonstration", value: prospect.demoDoneAt ? `Réalisée le ${formatFrenchDate(prospect.demoDoneAt)}` : prospect.demoAt ? `Programmée le ${formatDateTime(prospect.demoAt)}` : "Aucune" },
            ]}
          />
        ) : (
          <EmptyLine>Officine créée sans dossier commercial.</EmptyLine>
        )}
      </AdminSection>

      <AdminSection title="Technique" action={<MoreLink href={tabHref(pharmacy.id, "technique")}>État détaillé</MoreLink>}>
        <FactList
          className="sm:grid-cols-1"
          items={[
            { label: "Connecteur", value: <StatusBadge status={base.connector} />, hint: pharmacy.stockConnection ? lgoLabel(pharmacy.stockConnection.lgo) : undefined },
            ...(pharmacy.stockConnection ? [{ label: "Version de l'agent", value: <StatusBadge status={base.connector.version} /> }, { label: "Dernière synchro", value: <When date={pharmacy.stockConnection.lastSyncAt} empty="Jamais" /> }] : []),
            { label: "Incidents ouverts", value: base.counts.openIncidents > 0 ? <Badge tone="danger">{base.counts.openIncidents}</Badge> : "Aucun" },
          ]}
        />
      </AdminSection>

      <AdminSection title="Notes épinglées" action={<AddNoteButton pharmacyId={pharmacy.id} variant="ghost" label="Ajouter" />}>
        {extras.pinnedNotes.length === 0 ? (
          <EmptyLine>
            Aucune note épinglée. <Link href={tabHref(pharmacy.id, "notes")} className="font-medium text-brand-700 hover:underline dark:text-brand-400">Voir les notes</Link>
          </EmptyLine>
        ) : (
          <ul className="space-y-3">
            {extras.pinnedNotes.map((note) => (
              <li key={note.id} className="rounded-xl border border-brand-100 bg-brand-50/50 p-3 dark:border-brand-900 dark:bg-brand-950/30">
                <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-brand-800 dark:text-brand-200">
                  <Pin className="size-3" aria-hidden="true" />
                  {note.authorLabel} · {formatFrenchDate(note.createdAt)}
                </p>
                <p className="mt-1 text-[13px] leading-5 whitespace-pre-line text-text-primary">{truncate(note.body, 280)}</p>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection className="lg:col-span-2" title="Dernière activité" description="Les huit derniers faits, toutes sources confondues." action={<MoreLink href={tabHref(pharmacy.id, "historique")}>Tout l&apos;historique</MoreLink>}>
        <Timeline entries={extras.timeline} emptyText="Rien d'enregistré pour l'instant." />
      </AdminSection>
    </div>
  );
}
