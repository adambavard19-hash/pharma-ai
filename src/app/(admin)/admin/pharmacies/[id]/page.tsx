import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cable, Clock3, CreditCard, FileSignature, FileText, PencilLine } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadPharmacy360, type Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import { loadAllTemplates } from "@/server/services/admin/email-templates";
import { AdminPageHeader } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { ContactDialog } from "@/components/admin/contact-dialog";
import { RemindContractButton } from "@/components/admin/remind-contract-button";
import { StatusBadge, SubscriptionStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { LinkTabs } from "@/components/ui/tabs";
import { formatEuros, formatFrenchDate, SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatusCode } from "@/core/billing/subscription";
import { CANCELLATION_STATUS_LABELS, type CancellationStatusCode } from "@/core/admin/statuses";
import { CONTRACT_STATUS_LABELS, type ContractStatusCode } from "@/core/sales/pipeline";
import { parseTimelineKind, pharmacyStatusLabel, searchParam } from "@/core/admin/clients";
import { formatRelative } from "@/lib/format";
import { AccessToggle } from "../access-toggle";
import { AddNoteButton } from "./notes";
import { parseTab, tabHref, type TabKey } from "./shared";
import { OverviewTab } from "./tab-apercu";
import { SubscriptionTab } from "./tab-abonnement";
import { PerformanceTab } from "./tab-performance";
import { ContractsTab } from "./tab-contrats";
import { PaymentsTab } from "./tab-paiements";
import { UsersTab } from "./tab-utilisateurs";
import { TechniqueTab } from "./tab-technique";
import { InstallPanel } from "./install-panel";
import { CommunicationTab } from "./tab-communication";
import { CommercialTab } from "./tab-commercial";
import { HistoryTab } from "./tab-historique";
import { NotesTab } from "./tab-notes";

export const metadata: Metadata = { title: "Officine cliente" };

/**
 * La fiche 360° d'une officine cliente : tout ce que l'équipe doit savoir
 * pour agir, en un endroit. Des faits d'entreprise uniquement — aucune donnée
 * patient, aucun compteur clinique.
 */
export default async function ClientPharmacyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const { id } = await params;
  const query = await searchParams;
  const tab = parseTab(searchParam(query, "onglet"));
  const now = new Date();

  const base = await loadPharmacy360(id, now);
  if (!base) notFound();
  const templates = await loadAllTemplates();
  const { pharmacy, subscription, price, latestContract } = base;
  const suspended = !pharmacy.isActive || Boolean(subscription?.suspendedAt);

  return (
    <>
      <AdminPageHeader
        space={{ label: "Clients", href: "/admin/pharmacies" }}
        parent={{ label: "Officines clientes", href: "/admin/pharmacies" }}
        title={pharmacy.name}
        badge={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={pharmacyStatusLabel(pharmacy)} />
            {subscription && <SubscriptionStatusBadge status={subscription.status} />}
          </span>
        }
        description={[pharmacy.city, `cliente depuis le ${formatFrenchDate(pharmacy.createdAt)}`].filter(Boolean).join(" · ")}
        actions={<QuickActions base={base} templates={templates} suspended={suspended} />}
      />

      {!pharmacy.isActive && (
        <Alert tone="warning" title="Officine suspendue">
          Les comptes de cette officine ne peuvent plus se connecter.{subscription?.suspendedReason ? ` Motif : ${subscription.suspendedReason}.` : ""} Aucune donnée n&apos;a été supprimée : la réactivation restitue l&apos;espace tel quel.
        </Alert>
      )}
      {pharmacy.isDemo && <Alert tone="info" title="Officine de démonstration">Elle est exclue des indicateurs d&apos;activité et de chiffre d&apos;affaires.</Alert>}
      {base.cancellationOpen && (
        <Alert
          tone="warning"
          title={`Résiliation : ${CANCELLATION_STATUS_LABELS[base.cancellationOpen.status as CancellationStatusCode]?.label ?? base.cancellationOpen.status}`}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/resiliations?statut=ouvertes">Suivre la demande</Link>
            </Button>
          }
        >
          Demande reçue le {formatFrenchDate(base.cancellationOpen.requestedAt)}
          {base.cancellationOpen.plannedEndAt ? `, fin prévue le ${formatFrenchDate(base.cancellationOpen.plannedEndAt)}` : ""}.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Abonnement"
          value={price ? formatEuros(price.cents) : "—"}
          hint={subscription ? `${SUBSCRIPTION_STATUS_LABELS[subscription.status as SubscriptionStatusCode]?.label ?? subscription.status} · ${subscription.plan.name}` : "Aucun abonnement"}
          href={tabHref(pharmacy.id, "abonnement")}
          icon={<CreditCard className="size-4" />}
        />
        <KpiTile
          label="Dernière connexion de l'équipe"
          value={base.teamLastLoginAt ? formatRelative(base.teamLastLoginAt) : "Jamais"}
          hint={`${pharmacy.memberships.filter((m) => m.isActive).length} compte${pharmacy.memberships.filter((m) => m.isActive).length > 1 ? "s" : ""} actif${pharmacy.memberships.filter((m) => m.isActive).length > 1 ? "s" : ""}`}
          href={tabHref(pharmacy.id, "utilisateurs")}
          tone={base.teamLastLoginAt ? "default" : "warning"}
          icon={<Clock3 className="size-4" />}
        />
        <KpiTile
          label="Connecteur"
          value={base.connector.label}
          hint={base.connector.state === "NONE" ? "Stock par import de fichier" : base.connector.version.label}
          href={tabHref(pharmacy.id, "technique")}
          tone={base.connector.tone === "danger" ? "danger" : base.connector.tone === "warning" ? "warning" : "default"}
          icon={<Cable className="size-4" />}
        />
        <KpiTile
          label="Dernier contrat"
          value={latestContract ? (CONTRACT_STATUS_LABELS[latestContract.status as ContractStatusCode] ?? latestContract.status) : "Aucun"}
          hint={latestContract ? `Version ${latestContract.version} · ${formatFrenchDate(latestContract.createdAt)}` : undefined}
          href={tabHref(pharmacy.id, "contrats")}
          icon={<FileSignature className="size-4" />}
        />
      </div>

      <LinkTabs
        basePath={`/admin/pharmacies/${pharmacy.id}`}
        items={[
          { key: "apercu", label: "Aperçu" },
          { key: "abonnement", label: "Abonnement" },
          { key: "performance", label: "Performance" },
          { key: "contrats", label: "Contrats", count: base.counts.contracts },
          { key: "paiements", label: "Paiements", count: base.counts.payments },
          { key: "utilisateurs", label: "Utilisateurs", count: base.counts.users },
          { key: "technique", label: "Technique", ...(base.counts.openIncidents > 0 ? { count: base.counts.openIncidents } : {}) },
          { key: "communication", label: "Communication", count: base.counts.emails },
          { key: "commercial", label: "Commercial" },
          { key: "historique", label: "Historique" },
          { key: "notes", label: "Notes", count: base.counts.notes },
        ]}
      />

      <TabContent tab={tab} base={base} now={now} templates={templates} kind={parseTimelineKind(searchParam(query, "type"))} query={query} />
    </>
  );
}

function TabContent({ tab, base, now, templates, kind, query }: { tab: TabKey; base: Pharmacy360; now: Date; templates: Awaited<ReturnType<typeof loadAllTemplates>>; kind: ReturnType<typeof parseTimelineKind>; query: Record<string, string | string[] | undefined> }) {
  switch (tab) {
    case "abonnement":
      return <SubscriptionTab base={base} now={now} />;
    case "performance":
      // L'identifiant vient de la fiche déjà chargée (existence vérifiée), jamais de l'adresse brute.
      return <PerformanceTab pharmacyId={base.pharmacy.id} query={query} now={now} />;
    case "contrats":
      return <ContractsTab base={base} now={now} />;
    case "paiements":
      return <PaymentsTab base={base} />;
    case "utilisateurs":
      return <UsersTab base={base} />;
    case "technique":
      // L'installation sous AnyDesk d'abord : c'est ce que l'équipe vient faire ici.
      return (
        <div className="space-y-5">
          <InstallPanel pharmacyId={base.pharmacy.id} now={now} />
          <TechniqueTab base={base} now={now} />
        </div>
      );
    case "communication":
      return <CommunicationTab base={base} templates={templates} />;
    case "commercial":
      return <CommercialTab base={base} now={now} />;
    case "historique":
      return <HistoryTab base={base} kind={kind} now={now} />;
    case "notes":
      return <NotesTab base={base} />;
    default:
      return <OverviewTab base={base} now={now} />;
  }
}

/** La barre d'actions rapides : contacter, relancer (selon la situation), contrat, abonnement, note, accès. */
function QuickActions({ base, templates, suspended }: { base: Pharmacy360; templates: Awaited<ReturnType<typeof loadAllTemplates>>; suspended: boolean }) {
  const { pharmacy, relaunch, latestContract } = base;
  // Largeur bornée : sur tablette, les boutons passent à la ligne au lieu de pousser le titre hors de l'écran.
  return (
    <div className="flex flex-wrap items-center gap-2 md:max-w-[30rem] md:justify-end lg:max-w-[46rem]">
      <ContactDialog pharmacyId={pharmacy.id} templates={templates} audience="Titulaire" label="Contacter" />
      {relaunch?.kind === "contract" && <RemindContractButton contractId={relaunch.contractId} signerEmail={relaunch.signerEmail} reminderCount={relaunch.reminderCount} />}
      {relaunch?.kind === "payment" && <ContactDialog pharmacyId={pharmacy.id} templates={templates} audience="Titulaire" defaultTemplateKey="payment.failed_reminder" label="Relancer le paiement" />}
      {relaunch?.kind === "trial" && <ContactDialog pharmacyId={pharmacy.id} templates={templates} audience="Titulaire" defaultTemplateKey="trial.ending_soon" label="Relancer (fin d'essai)" />}
      {latestContract && (
        <Button asChild size="sm" variant="secondary" leadingIcon={<FileText className="size-4" />}>
          <a href={`/api/contrats/apercu/${latestContract.id}`} target="_blank" rel="noopener noreferrer">
            Voir le contrat
          </a>
        </Button>
      )}
      <Button asChild size="sm" variant="secondary" leadingIcon={<PencilLine className="size-4" />}>
        <Link href={`/admin/abonnements/${pharmacy.id}`}>Modifier l&apos;abonnement</Link>
      </Button>
      <AddNoteButton pharmacyId={pharmacy.id} />
      <AccessToggle pharmacyId={pharmacy.id} pharmacyName={pharmacy.name} suspended={suspended} />
    </div>
  );
}
