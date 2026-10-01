import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import { CommissionStatusBadge, ContractStatusBadge, ProspectStatusBadge } from "./status-badge";
import type { getProspectFor } from "@/server/services/sales/prospects";
import { JOURNEY_LABELS, JOURNEY_STEPS, ORIGIN_LABELS, journeyStage, journeyStepIndex } from "@/core/contracts/journey";
import { cn } from "@/lib/utils";

export type ProspectDetailData = NonNullable<Awaited<ReturnType<typeof getProspectFor>>>;

/**
 * La fiche d'un dossier, lue par le commercial ou par l'administrateur. Les
 * gestes (changer l'étape, noter, relancer, contrat…) sont des panneaux
 * clients passés en `actions` ; ici, uniquement ce qui se lit.
 */
export function ProspectDetail({ prospect, actions, mode, pharmacyHref }: { prospect: ProspectDetailData; actions: React.ReactNode; mode: "sales" | "admin"; pharmacyHref?: string | null }) {
  const address = [prospect.addressLine1, [prospect.postalCode, prospect.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const commission = prospect.commissions.find((c) => c.status !== "CANCELLED") ?? prospect.commissions[0] ?? null;
  const openTasks = prospect.tasks.filter((t) => !t.doneAt);
  const latest = prospect.contracts[0] ?? null;
  const stage = journeyStage({ prospectStatus: prospect.status, contract: latest });
  const stageIndex = journeyStepIndex(stage);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] leading-7 font-semibold tracking-[-0.02em] text-text-primary">{prospect.name}</h1>
            <ProspectStatusBadge status={prospect.status} />
            {prospect.blockedAt && <Badge tone="danger">Suspendu</Badge>}
            <Badge tone="neutral">{ORIGIN_LABELS[prospect.origin] ?? prospect.origin}</Badge>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-text-secondary">
            {prospect.ownerName && <span>{prospect.ownerName}</span>}
            {address && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{address}</span>}
            {mode === "admin" && <span>Commercial : {prospect.salesRep ? `${prospect.salesRep.firstName} ${prospect.salesRep.lastName}` : "dossier tenu par la console"}</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {prospect.phone && <a href={`tel:${prospect.phone.replace(/\s+/g, "")}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border-default px-3.5 text-[13.5px] font-medium text-text-primary hover:bg-surface-sunken"><Phone className="size-4" />{prospect.phone}</a>}
            {prospect.email && <a href={`mailto:${prospect.email}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border-default px-3.5 text-[13.5px] font-medium text-text-primary hover:bg-surface-sunken"><Mail className="size-4" />{prospect.email}</a>}
          </div>
          {prospect.duplicateWarning && mode === "admin" && <p className="rounded-lg bg-warning-50 px-3.5 py-2.5 text-[13px] text-warning-800 dark:bg-warning-700/10 dark:text-warning-300">{prospect.duplicateWarning}</p>}
          {prospect.blockedAt && <p className="rounded-lg bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700 dark:bg-danger-700/10 dark:text-danger-400">Dossier suspendu par l&apos;administrateur{prospect.blockedReason ? ` : ${prospect.blockedReason}` : ""}.</p>}
        </header>

        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">Parcours</p>
              <p className="text-[13.5px] font-medium text-text-primary">{JOURNEY_LABELS[stage]}</p>
            </div>
            <ol className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-8" aria-label="Étapes du dossier">
              {JOURNEY_STEPS.map((step, i) => (
                <li key={step} className="space-y-1">
                  <div className={cn("h-1.5 rounded-full", stageIndex >= 0 && i <= stageIndex ? "bg-brand-600" : "bg-border-subtle", stageIndex < 0 && (stage === "REFUSED" || stage === "EXPIRED" || stage === "LOST") && "bg-border-subtle")} />
                  <p className={cn("text-[11px] leading-tight", i === stageIndex ? "font-semibold text-text-primary" : "text-text-tertiary")}>{JOURNEY_LABELS[step]}</p>
                </li>
              ))}
            </ol>
            {stageIndex < 0 && <p className="mt-2 text-[12.5px] text-danger-700 dark:text-danger-400">{JOURNEY_LABELS[stage]}{latest?.refusalReason ? ` — ${latest.refusalReason}` : ""}</p>}
          </CardContent>
        </Card>

        {actions}

        <Card>
          <CardHeader title="Contrat" />
          <CardContent className="pt-0">
            {prospect.contracts.length === 0 ? (
              <p className="py-2 text-[13.5px] text-text-secondary">Aucun contrat généré.</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {prospect.contracts.map((c) => (
                  <li key={c.id} className="space-y-1 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-[14px]"><span className="font-medium text-text-primary">Contrat v{c.version}</span><ContractStatusBadge status={c.status} /><span className="text-text-tertiary">{formatCents(c.monthlyPriceCents)} HT/mois · {c.durationMonths} mois</span></div>
                    <p className="text-[12.5px] text-text-secondary">
                      {[c.sentAt && `envoyé le ${formatDateTime(c.sentAt)}`, c.openedAt && `ouvert le ${formatDateTime(c.openedAt)}`, c.pharmacySignedAt && `signé pharmacie le ${formatDateTime(c.pharmacySignedAt)}`, c.companySignedAt && `signé société le ${formatDateTime(c.companySignedAt)}`, c.finalizedAt && `finalisé le ${formatDateTime(c.finalizedAt)}`, c.refusedAt && `refusé le ${formatDateTime(c.refusedAt)}${c.refusalReason ? ` (${c.refusalReason})` : ""}`].filter(Boolean).join(" · ") || "brouillon, non envoyé"}
                    </p>
                    <p className="text-[12px] text-text-tertiary">Signataires : {c.pharmacySignerName} (pharmacie) · {c.companySignerName} (société) · signature : {c.signatureProvider === "none" ? "aucun prestataire" : c.signatureProvider}{c.plan?.name ? ` · offre ${c.plan.name}` : ""}{c.trialDays ? ` · ${c.trialDays >= 28 && c.trialDays <= 31 ? "premier mois offert" : `${c.trialDays} jours offerts`}` : ""}</p>
                    {(c.signedArchivedAt || c.reminderCount > 0 || c.expiresAt) && (
                      <p className="text-[12px] text-text-tertiary">
                        {[c.signedArchivedAt && `PDF signé archivé le ${formatDateTime(c.signedArchivedAt)}`, c.reminderCount > 0 && `${c.reminderCount} relance${c.reminderCount > 1 ? "s" : ""}${c.lastReminderAt ? ` (dernière le ${formatDate(c.lastReminderAt)})` : ""}`, c.escalatedAt && `signalé le ${formatDate(c.escalatedAt)}`, !c.finalizedAt && c.expiresAt && `signature possible jusqu'au ${formatDate(c.expiresAt)}`, c.providerEnvelopeId && mode === "admin" && `demande ${c.providerEnvelopeId}`].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Commission" />
          <CardContent className="pt-0">
            {!commission ? (
              <p className="py-2 text-[13.5px] text-text-secondary">Créée à l&apos;envoi du contrat (prévisionnelle), acquise à sa finalisation.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1 text-[14px]">
                <span className="text-[20px] font-semibold tabular text-text-primary">{formatCents(commission.amountCents)}</span>
                <CommissionStatusBadge status={commission.status} />
                {commission.dueAt && <span className="text-text-secondary">Paiement prévu le {formatDate(commission.dueAt)}</span>}
                {commission.paidAt && <span className="text-text-secondary">Payée le {formatDate(commission.paidAt)}</span>}
                {commission.note && <span className="w-full text-[12.5px] text-text-tertiary">{commission.note}</span>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Historique" />
          <CardContent className="pt-0">
            <ul className="divide-y divide-border-subtle">
              {prospect.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                  <span className="w-[140px] shrink-0 text-[12px] tabular text-text-tertiary">{formatDateTime(event.createdAt)}</span>
                  <span className="min-w-0 flex-1 text-[13.5px] text-text-primary">{event.summary}</span>
                  <span className="text-[12px] text-text-tertiary">{event.actorLabel}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-5">
        <Card>
          <CardHeader title="Fiche" />
          <CardContent className="space-y-1.5 pt-0 text-[13.5px]">
            <Row label="Raison sociale" value={prospect.legalName} />
            <Row label="SIRET" value={prospect.siret} />
            <Row label="FINESS" value={prospect.finessNumber} />
            <Row label="Signataire" value={prospect.ownerName ? `${prospect.ownerName}${prospect.ownerTitle ? ` (${prospect.ownerTitle})` : ""}` : null} />
            <Row label="Origine" value={`${ORIGIN_LABELS[prospect.origin] ?? prospect.origin}${prospect.subscriptionRequestedAt ? ` · souscription demandée le ${formatDateTime(prospect.subscriptionRequestedAt)}` : ""}`} />
            <Row label="Offre" value={prospect.plan ? `${prospect.plan.name} · ${formatCents(prospect.plan.monthlyPriceCents)} HT/mois` : null} />
            <Row label="Points de vente" value={prospect.outletCount ? String(prospect.outletCount) : null} />
            <Row label="Abonnement proposé" value={prospect.monthlyPriceCents ? `${formatCents(prospect.monthlyPriceCents)} HT/mois` : null} />
            <Row label="Dernier contact" value={prospect.lastContactAt ? formatDateTime(prospect.lastContactAt) : null} />
            <Row label="Prochaine action" value={prospect.nextActionAt ? `${prospect.nextActionLabel ?? "Relancer"} · ${formatDate(prospect.nextActionAt)}` : null} />
            {prospect.notes && <p className="mt-2 rounded-lg bg-surface-sunken/70 px-3 py-2 text-[13px] leading-5 text-text-secondary">{prospect.notes}</p>}
          </CardContent>
        </Card>
        {openTasks.length > 0 && (
          <Card>
            <CardHeader title="Relances prévues" />
            <CardContent className="pt-0">
              <ul className="divide-y divide-border-subtle text-[13.5px]">{openTasks.map((t) => <li key={t.id} className="py-2"><span className="font-medium text-text-primary">{t.label}</span><span className="block text-[12.5px] text-text-secondary">{formatDate(t.dueAt)}</span></li>)}</ul>
            </CardContent>
          </Card>
        )}
        {prospect.pharmacy && (
          <Card>
            <CardHeader title="Officine PharmaBoost" />
            <CardContent className="space-y-1 pt-0 text-[13.5px]">
              <p className="font-medium text-text-primary">{prospect.pharmacy.name}</p>
              <p className="text-text-secondary">Créée le {formatDate(prospect.pharmacy.createdAt)} · {prospect.pharmacy.isActive ? "active" : "suspendue"}</p>
              <p className="text-text-secondary">Titulaire : {prospect.pharmacy.memberships[0]?.user.email ?? "—"}{prospect.pharmacy.memberships[0]?.user.lastLoginAt ? ` · connecté le ${formatDate(prospect.pharmacy.memberships[0].user.lastLoginAt)}` : " · jamais connecté"}</p>
              {pharmacyHref && <Link href={pharmacyHref} className="text-[13px] text-brand-700 underline underline-offset-2 dark:text-brand-400">Ouvrir dans la console</Link>}
            </CardContent>
          </Card>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return <p><span className="text-text-tertiary">{label} : </span><span className="text-text-primary">{value ?? "—"}</span></p>;
}
