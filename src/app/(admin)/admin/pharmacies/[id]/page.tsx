import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
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
import { parseTab, sectionToOpen, tabGroupOf, tabHref, TAB_GROUPS, type TabGroupKey } from "./shared";
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
import { StockSection } from "./tab-stock";
import { SupportSection } from "./tab-support";
import { ScrollToSection } from "./scroll-to-section";
import { CreateCancellationButton } from "../../resiliations/create-cancellation";
import { dayInParis } from "@/server/services/admin/billing-admin";

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
  const group = tabGroupOf(tab);
  const section = sectionToOpen(tab);
  const now = new Date();

  const base = await loadPharmacy360(id, now);
  if (!base) notFound();
  const templates = await loadAllTemplates();
  const { pharmacy, subscription, price, latestContract } = base;
  const suspended = !pharmacy.isActive || Boolean(subscription?.suspendedAt);
  // Les pastilles des onglets : ce qui demande un regard (incidents), ou le nombre d'éléments utiles.
  const counts: Partial<Record<TabGroupKey, number>> = {
    equipe: base.counts.users,
    technique: base.counts.openIncidents,
    facturation: base.counts.contracts + base.counts.payments,
    communication: base.counts.emails,
    commercial: base.counts.notes,
  };

  return (
    <>
      <AdminPageHeader
        parent={{ label: "Toutes les officines", href: "/admin/pharmacies" }}
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
        activeKey={group}
        items={TAB_GROUPS.map((entry) => ({
          key: entry.key,
          label: entry.label,
          ...(counts[entry.key] ? { count: counts[entry.key] } : {}),
        }))}
      />
      {section && <ScrollToSection id={section} />}

      <TabContent group={group} base={base} now={now} templates={templates} kind={parseTimelineKind(searchParam(query, "type"))} query={query} />
    </>
  );
}

function TabContent({ group, base, now, templates, kind, query }: { group: TabGroupKey; base: Pharmacy360; now: Date; templates: Awaited<ReturnType<typeof loadAllTemplates>>; kind: ReturnType<typeof parseTimelineKind>; query: Record<string, string | string[] | undefined> }) {
  switch (group) {
    case "equipe":
      return <UsersTab base={base} />;
    case "technique":
      // L'installation sous AnyDesk d'abord : c'est ce que l'équipe vient faire ici.
      return (
        <div className="space-y-8">
          <div id="technique" className="scroll-mt-44 space-y-5">
            <InstallPanel pharmacyId={base.pharmacy.id} now={now} />
            <TechniqueTab base={base} now={now} />
          </div>
          <StockSection base={base} now={now} />
        </div>
      );
    case "facturation":
      return (
        <div className="space-y-8">
          <div id="abonnement" className="scroll-mt-44 space-y-3">
            <SectionLabel>Abonnement et tarif</SectionLabel>
            <SubscriptionTab base={base} now={now} />
            <CancellationPrompt base={base} />
          </div>
          <div id="contrats" className="scroll-mt-44 space-y-3">
            <SectionLabel>Contrats et signatures</SectionLabel>
            <ContractsTab base={base} now={now} />
          </div>
          <div id="paiements" className="scroll-mt-44 space-y-3">
            <SectionLabel>Paiements</SectionLabel>
            <PaymentsTab base={base} />
          </div>
        </div>
      );
    case "communication":
      return (
        <div className="space-y-8">
          <div id="communication" className="scroll-mt-44 space-y-3">
            <SectionLabel>Échanges avec le titulaire</SectionLabel>
            <CommunicationTab base={base} templates={templates} />
          </div>
          <SupportSection pharmacyId={base.pharmacy.id} />
        </div>
      );
    case "commercial":
      return (
        <div className="space-y-8">
          <div id="commercial" className="scroll-mt-44 space-y-3">
            <SectionLabel>Suivi commercial</SectionLabel>
            <CommercialTab base={base} now={now} />
          </div>
          <div id="notes" className="scroll-mt-44 space-y-3">
            <SectionLabel>Notes internes</SectionLabel>
            <NotesTab base={base} />
          </div>
        </div>
      );
    case "activite":
      return (
        <div className="space-y-8">
          <div id="performance" className="scroll-mt-44 space-y-3">
            <SectionLabel>Performance</SectionLabel>
            {/* L'identifiant vient de la fiche déjà chargée (existence vérifiée), jamais de l'adresse brute. */}
            <PerformanceTab pharmacyId={base.pharmacy.id} query={query} now={now} />
          </div>
          <div id="historique" className="scroll-mt-44 space-y-3">
            <SectionLabel>Historique</SectionLabel>
            <HistoryTab base={base} kind={kind} now={now} />
          </div>
        </div>
      );
    default:
      return <OverviewTab base={base} now={now} />;
  }
}

/** Le titre discret d'une section quand plusieurs partagent un onglet. */
function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-[12.5px] font-semibold tracking-wide text-text-tertiary uppercase">{children}</h2>;
}

/** Enregistrer une demande de résiliation depuis la fiche : rien n'est coupé, la demande suit son cours dans « Résiliations ». */
function CancellationPrompt({ base }: { base: Pharmacy360 }) {
  const { pharmacy, subscription, cancellationOpen } = base;
  if (cancellationOpen) return null;
  const ongoing = Boolean(subscription && !["CANCELED", "INCOMPLETE_EXPIRED"].includes(subscription.status));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-sunken px-4 py-3">
      <p className="text-[13px] text-text-secondary">Le titulaire veut arrêter ? Enregistrer la demande ne coupe rien : elle suit son cours dans « Finances → Résiliations ».</p>
      <CreateCancellationButton
        fixedPharmacy={{ id: pharmacy.id, name: pharmacy.name, city: pharmacy.city, hasOpenRequest: false, hasSubscription: Boolean(subscription), suggestedEndAt: ongoing ? dayInParis(subscription?.currentPeriodEnd) : null }}
        label="Enregistrer une demande de résiliation"
      />
    </div>
  );
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
