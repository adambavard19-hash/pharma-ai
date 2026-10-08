import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Eye, FolderOpen } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getContractForAdmin, signatureProviderState } from "@/server/services/admin/contracts-admin";
import { expiryHint } from "@/core/contracts/admin-view";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { TIME_ZONE } from "@/config/constants";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Timeline } from "@/components/admin/timeline";
import { RemindContractButton } from "@/components/admin/remind-contract-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { SendDraftButton } from "../send-draft-button";
import { SignatureBanner } from "../signature-banner";

export const metadata: Metadata = { title: "Contrat" };

const dateTime = (d: Date | null) => (d ? new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d).replace(/,? /, " à ") : null);

const PROVIDER_LABELS: Record<string, string> = {
  none: "Aucun : lien sécurisé, sans signature électronique",
  offline: "Signature papier enregistrée par l'administrateur",
  yousign: "Yousign",
  docuseal: "DocuSeal",
};

function trialLabel(days: number): string {
  if (!days) return "Aucun";
  return days >= 28 && days <= 31 ? "Premier mois offert" : `${days} jours offerts`;
}

/**
 * La fiche d'un contrat : ses conditions, l'avancement de la signature, les
 * parties telles qu'imprimées (copie figée à la génération), les autres
 * versions du dossier et l'historique complet.
 */
export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformSession();
  const { id } = await params;
  const now = new Date();
  const data = await getContractForAdmin(id, now);
  if (!data) notFound();
  const signature = signatureProviderState();
  const { contract, reference, display, superseded, blocked, stale, companySnapshot, pharmacySnapshot, versions, timeline } = data;
  const pharmacyName = contract.pharmacy?.name ?? contract.prospect.name;
  const awaiting = contract.status === "SENT" || contract.status === "OPENED";
  const expired = Boolean(contract.expiresAt && contract.expiresAt.getTime() <= now.getTime());
  const canSend = contract.status === "DRAFT" && !superseded && !blocked;
  const canRemind = awaiting && !superseded && !blocked && !expired;
  const expiry = expiryHint(contract, now);
  const latest = versions[0];
  const rep = contract.prospect.salesRep;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Finances", href: "/admin/abonnements" }}
        parent={{ label: "Contrats", href: "/admin/contrats" }}
        title={`Contrat ${reference}`}
        badge={<StatusBadge status={display} />}
        description={`${pharmacyName} · version ${contract.version} · généré le ${formatFrenchDate(contract.createdAt)}`}
        actions={
          <>
            {canSend && (
              <SendDraftButton
                contractId={contract.id}
                reference={reference}
                signerName={contract.pharmacySignerName}
                signerEmail={contract.pharmacySignerEmail}
                monthlyPrice={formatEuros(contract.monthlyPriceCents)}
                generatedOn={formatFrenchDate(contract.createdAt)}
                stale={stale}
                signatureLabel={signature.label}
                signatureLive={signature.configured}
                size="md"
              />
            )}
            {canRemind && <RemindContractButton contractId={contract.id} signerEmail={contract.pharmacySignerEmail} reminderCount={contract.reminderCount} size="md" />}
            <Button asChild variant="outline" leadingIcon={<FolderOpen className="size-4" />}>
              <Link href={`/admin/dossiers/${contract.prospectId}`}>Dossier</Link>
            </Button>
            <Button asChild variant="outline" leadingIcon={<Eye className="size-4" />}>
              <a href={`/api/contrats/apercu/${contract.id}`} target="_blank" rel="noopener noreferrer">
                PDF
              </a>
            </Button>
            <Button asChild variant="ghost" leadingIcon={<Download className="size-4" />}>
              <a href={`/api/contrats/apercu/${contract.id}`} download={`${reference}.pdf`}>
                Télécharger
              </a>
            </Button>
          </>
        }
      />

      {superseded && latest && (
        <Alert tone="info" title="Une version plus récente existe">
          Ce contrat a été remplacé par la{" "}
          <Link href={`/admin/contrats/${latest.id}`} className="font-medium underline underline-offset-2">
            version {latest.version}
          </Link>
          . Il est conservé tel quel, pour l&apos;historique.
        </Alert>
      )}
      {blocked && <Alert tone="danger" title="Dossier suspendu">Aucun envoi ni aucune relance ne part tant que la suspension n&apos;est pas levée depuis le dossier.</Alert>}
      {stale && !superseded && (
        <Alert tone="warning" title="Le dossier a changé depuis ce brouillon">
          Le PDF de ce brouillon ne reflète peut-être plus le dossier. Pour envoyer un contrat à jour, préparez une nouvelle version depuis le dossier.
        </Alert>
      )}
      {awaiting && expired && !superseded && <Alert tone="danger" title="Lien de signature expiré">Le délai de signature est dépassé : ce contrat ne peut plus être relancé. Préparez une nouvelle version depuis le dossier.</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <AdminSection title="Conditions" description="Telles qu'inscrites dans le PDF.">
            <FactList
              items={[
                { label: "Tarif mensuel", value: `${formatEuros(contract.monthlyPriceCents)} HT`, hint: `soit ${formatEuros(contract.monthlyPriceCents * 12)} HT par an` },
                { label: "Durée", value: `${contract.durationMonths} mois`, hint: "Renouvelable tacitement par périodes de douze mois" },
                { label: "Période offerte", value: trialLabel(contract.trialDays) },
                { label: "Offre", value: contract.plan?.name ?? null },
                { label: "Prise d'effet", value: contract.startDate ? formatFrenchDate(contract.startDate) : null },
                { label: "Modèle de contrat", value: <span className="font-mono text-[13px]">{contract.templateKey}</span> },
                { label: "Officine", value: contract.pharmacy ? <Link href={`/admin/pharmacies/${contract.pharmacy.id}`} className="text-brand-700 hover:underline dark:text-brand-300">{contract.pharmacy.name}</Link> : "Pas encore créée", hint: contract.pharmacy ? undefined : "L'espace de l'officine est créé après la signature." },
                { label: "Suivi par", value: rep ? `${rep.firstName} ${rep.lastName}` : "La console (sans commercial)" },
              ]}
            />
          </AdminSection>

          <AdminSection title="Signature" description={PROVIDER_LABELS[contract.signatureProvider] ?? contract.signatureProvider}>
            <FactList
              items={[
                { label: "Envoyé le", value: dateTime(contract.sentAt) },
                { label: "Consulté le", value: dateTime(contract.openedAt) },
                { label: "Signé par l'officine", value: dateTime(contract.pharmacySignedAt) },
                { label: "Signé par la société", value: dateTime(contract.companySignedAt) },
                { label: "Finalisé le", value: dateTime(contract.finalizedAt) },
                { label: "PDF signé archivé", value: contract.signedArchivedAt ? dateTime(contract.signedArchivedAt) : contract.finalizedAt ? "Pas encore" : null },
                ...(contract.refusedAt ? [{ label: "Refusé le", value: dateTime(contract.refusedAt), hint: contract.refusalReason ?? undefined }] : []),
                {
                  label: "Expiration du lien",
                  value: contract.expiresAt && (awaiting || contract.status === "EXPIRED") ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {formatFrenchDate(contract.expiresAt)}
                      {expiry && <Badge tone={expiry.tone}>{expiry.label}</Badge>}
                    </span>
                  ) : contract.status === "DRAFT" ? (
                    "Le délai de 30 jours court à partir de l'envoi"
                  ) : null,
                },
                {
                  label: "Relances",
                  value: `${contract.reminderCount}`,
                  hint: [contract.lastReminderAt ? `dernière le ${formatFrenchDate(contract.lastReminderAt)}` : null, contract.escalatedAt ? `signalé à l'équipe le ${formatFrenchDate(contract.escalatedAt)}` : null].filter(Boolean).join(" · ") || undefined,
                },
              ]}
            />
          </AdminSection>

          <AdminSection title="Parties telles qu'imprimées" description="La copie enregistrée à la génération. Une modification ultérieure de la fiche société ou du dossier ne la change pas.">
            {companySnapshot && pharmacySnapshot ? (
              <div className="grid gap-4 md:grid-cols-2">
                <PartyCard
                  title="La Société"
                  lines={[
                    `${companySnapshot.legalName}${companySnapshot.legalForm ? `, ${companySnapshot.legalForm}` : ""}`,
                    companySnapshot.address,
                    companySnapshot.siren ? `SIREN ${companySnapshot.siren}` : null,
                    `Représentée par ${companySnapshot.representativeName}${companySnapshot.representativeTitle ? `, ${companySnapshot.representativeTitle}` : ""}`,
                    companySnapshot.representativeEmail,
                  ]}
                />
                <PartyCard
                  title="L'Officine"
                  lines={[
                    pharmacySnapshot.legalName && pharmacySnapshot.legalName.toLowerCase() !== pharmacySnapshot.name.toLowerCase() ? `${pharmacySnapshot.legalName}, exploitant l'officine ${pharmacySnapshot.name}` : pharmacySnapshot.name,
                    pharmacySnapshot.address,
                    [pharmacySnapshot.finessNumber ? `FINESS ${pharmacySnapshot.finessNumber}` : null, pharmacySnapshot.siret ? `SIRET ${pharmacySnapshot.siret}` : null].filter(Boolean).join(" · ") || null,
                    `Représentée par ${pharmacySnapshot.ownerName}, ${pharmacySnapshot.ownerTitle}`,
                    pharmacySnapshot.email,
                    `${pharmacySnapshot.outletCount} point${pharmacySnapshot.outletCount > 1 ? "s" : ""} de vente`,
                  ]}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <Alert tone="neutral" title="Copie des parties non enregistrée">
                  Ce contrat a été généré avant que la console n&apos;enregistre la copie des parties. Le PDF fait foi ; les signataires ci-dessous sont ceux enregistrés à la génération.
                </Alert>
                <div className="grid gap-4 md:grid-cols-2">
                  <PartyCard title="Pour la Société" lines={[contract.companySignerName, contract.companySignerEmail]} />
                  <PartyCard title="Pour l'Officine" lines={[contract.pharmacySignerName, contract.pharmacySignerEmail]} />
                </div>
              </div>
            )}
          </AdminSection>

          <AdminSection title="Historique" description="Les événements du dossier liés à ce contrat et les e-mails qui le concernent.">
            <Timeline entries={timeline} emptyText="Aucun événement enregistré pour ce contrat." />
          </AdminSection>
        </div>

        <div className="min-w-0 space-y-6">
          <AdminSection title="Versions du dossier" padded={false}>
            <ul className="divide-y divide-border-subtle">
              {versions.map((v) => (
                <li key={v.id}>
                  <Link href={`/admin/contrats/${v.id}`} aria-current={v.id === contract.id ? "page" : undefined} className={cn("flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken", v.id === contract.id && "bg-brand-50/60 dark:bg-brand-950/30")}>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-text-primary">Version {v.version}</span>
                      <span className="block truncate font-mono text-[12px] text-text-tertiary">{v.reference}</span>
                      <span className="block text-[12px] text-text-tertiary">générée le {formatFrenchDate(v.createdAt)}</span>
                    </span>
                    <StatusBadge status={v.display} />
                  </Link>
                </li>
              ))}
            </ul>
          </AdminSection>

          <AdminSection title="Signataires">
            <FactList
              className="sm:grid-cols-1"
              items={[
                { label: "Pour l'officine", value: contract.pharmacySignerName, hint: contract.pharmacySignerEmail },
                { label: "Pour la société", value: contract.companySignerName, hint: contract.companySignerEmail },
              ]}
            />
          </AdminSection>

          <SignatureBanner state={signature} />
        </div>
      </div>
    </div>
  );
}

function PartyCard({ title, lines }: { title: string; lines: (string | null)[] }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-sunken/50 p-4">
      <p className="text-[12px] font-semibold tracking-[0.04em] text-text-tertiary uppercase">{title}</p>
      <div className="mt-2 space-y-0.5 text-[13.5px] leading-5 text-text-primary">
        {lines.filter((l): l is string => Boolean(l && l.trim())).map((line) => (
          <p key={line} className="break-words">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
