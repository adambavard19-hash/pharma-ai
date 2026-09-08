import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import { CommissionStatusBadge, ContractStatusBadge, ProspectStatusBadge } from "./status-badge";
import type { getProspectFor } from "@/server/services/sales/prospects";

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
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] leading-7 font-semibold tracking-[-0.02em] text-text-primary">{prospect.name}</h1>
            <ProspectStatusBadge status={prospect.status} />
            {prospect.blockedAt && <Badge tone="danger">Suspendu</Badge>}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-text-secondary">
            {prospect.ownerName && <span>{prospect.ownerName}</span>}
            {address && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{address}</span>}
            {mode === "admin" && <span>Commercial : {prospect.salesRep.firstName} {prospect.salesRep.lastName}</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {prospect.phone && <a href={`tel:${prospect.phone.replace(/\s+/g, "")}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border-default px-3.5 text-[13.5px] font-medium text-text-primary hover:bg-surface-sunken"><Phone className="size-4" />{prospect.phone}</a>}
            {prospect.email && <a href={`mailto:${prospect.email}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border-default px-3.5 text-[13.5px] font-medium text-text-primary hover:bg-surface-sunken"><Mail className="size-4" />{prospect.email}</a>}
          </div>
          {prospect.blockedAt && <p className="rounded-lg bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700 dark:bg-danger-700/10 dark:text-danger-400">Dossier suspendu par l&apos;administrateur{prospect.blockedReason ? ` : ${prospect.blockedReason}` : ""}.</p>}
        </header>

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
                    <p className="text-[12px] text-text-tertiary">Signataires : {c.pharmacySignerName} (pharmacie) · {c.companySignerName} (société) · signature : {c.signatureProvider === "none" ? "aucun prestataire" : c.signatureProvider}</p>
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
            <Row label="FINESS" value={prospect.finessNumber} />
            <Row label="SIRET" value={prospect.siret} />
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
