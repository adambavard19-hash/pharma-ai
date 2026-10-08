import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarClock, FileSignature, Mail, ToggleRight } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getMessagingProvider } from "@/server/ai/registry";
import { loadReminderPolicy } from "@/server/services/platform-settings";
import { loadAllTemplates } from "@/server/services/admin/email-templates";
import { loadRelancesOverview, loadRules, recentDispatchesByRule, relancesTileHref } from "@/server/services/admin/automations";
import { automationStatusLabel } from "@/server/services/admin/communications";
import { AUTOMATION_SCENARIOS, CATCH_UP_DAYS, type AutomationScenario, type ResolvedRule } from "@/core/admin/automations";
import { DISPATCH_TRIGGER_LABELS, dispatchStatusLabel } from "@/core/admin/statuses";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RuleCard, type RuleCardDispatch, type RuleCardTemplate } from "./rule-card";
import { ContractCadenceForm } from "./contract-cadence";
import { RunAutomationsNow } from "./run-now";
import { AutomationPreviewButton } from "./automation-preview";

export const metadata: Metadata = { title: "Relances automatiques" };

/** L'ancre et la puce de navigation de chaque section : le type oblige à en nommer une pour tout nouveau scénario. */
const SECTION_NAV: Record<AutomationScenario | "CONTRACT", { anchor: string; label: string }> = {
  TRIAL: { anchor: "essai", label: "Essai" },
  CONTRACT: { anchor: "contrat", label: "Contrat" },
  PAYMENT: { anchor: "paiement", label: "Paiement" },
  CANCELLATION: { anchor: "resiliation", label: "Résiliation" },
  COMMERCIAL: { anchor: "commercial", label: "Suivi commercial" },
  REFERRAL: { anchor: "parrainage", label: "Parrainage" },
  PARTNER: { anchor: "partenaires", label: "Partenaires" },
};

/** L'ordre de lecture : les scénarios dans l'ordre où ils sont déclarés, tous, sans liste à tenir à part ; le contrat s'insère après l'essai. */
const SECTIONS: { key: AutomationScenario | "CONTRACT"; anchor: string; label: string }[] = (Object.keys(AUTOMATION_SCENARIOS) as AutomationScenario[])
  .flatMap((key): (AutomationScenario | "CONTRACT")[] => (key === "TRIAL" ? [key, "CONTRACT"] : [key]))
  .map((key) => ({ key, ...SECTION_NAV[key] }));

function StatePanel({ icon, title, badge, children }: { icon: ReactNode; title: string; badge: { label: string; tone: "success" | "warning" | "neutral" | "info" }; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-border-subtle bg-surface-card p-4">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          badge.tone === "success" ? "bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-500" : badge.tone === "warning" ? "bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500" : "bg-surface-sunken text-text-tertiary",
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] leading-5 font-semibold text-text-primary">{title}</p>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        <p className="text-[12.5px] leading-5 text-text-secondary">{children}</p>
      </div>
    </div>
  );
}

/**
 * Le centre des relances : tous les scénarios au même endroit, désactivés
 * tant qu'un administrateur ne les a pas activés, chacun avec ce qu'il
 * enverrait aujourd'hui et ce qu'il a déjà envoyé.
 */
export default async function RelancesPage() {
  await requirePlatformSession();
  const now = new Date();
  const [rules, policy, recent, templates, overview] = await Promise.all([loadRules(), loadReminderPolicy(), recentDispatchesByRule(5), loadAllTemplates(), loadRelancesOverview(now)]);

  // Aucun secret affiché : le nom du service et son état seulement.
  const messaging = getMessagingProvider().info;
  const messagingLive = messaging.capability === "LIVE";
  const schedulerActive = Boolean(process.env.CRON_SECRET);
  const enabledCount = rules.filter((r) => r.enabled).length;

  const templateByKey = new Map(templates.map((t) => [t.key, t]));
  const templateOf = (rule: ResolvedRule): RuleCardTemplate | null => {
    const t = rule.templateKey ? templateByKey.get(rule.templateKey) : null;
    return t ? { key: t.key, label: t.label, customized: t.customized, text: t.text } : null;
  };
  const recentOf = (rule: ResolvedRule): RuleCardDispatch[] =>
    (recent.get(rule.key) ?? []).map((d) => ({
      id: d.id,
      at: formatDateTime(d.createdAt),
      status: automationStatusLabel(d.status),
      recipient: d.recipient,
      detail: d.detail,
      targetLabel: d.targetLabel ?? (d.targetType === "Prospect" ? "Dossier commercial" : d.targetType === "Partner" ? "Partenaire" : null),
      href: d.pharmacyId ? `/admin/pharmacies/${d.pharmacyId}?onglet=communication` : d.targetType === "Prospect" ? `/admin/dossiers/${d.targetId}` : d.targetType === "Partner" ? `/admin/partenaires/liste/${d.targetId}` : null,
    }));
  const contractTemplate = templateByKey.get("contract.reminder");

  return (
    <>
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Relances automatiques"
        description="Les scénarios qui écrivent aux officines à votre place, ou qui alertent l'équipe. Chaque règle est désactivée tant que vous ne l'avez pas activée."
        actions={
          <>
            <AutomationPreviewButton title="Aperçu du prochain passage" label="Prévisualiser le passage" variant="secondary" size="md" />
            <RunAutomationsNow enabledRules={enabledCount} messagingLive={messagingLive} />
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatePanel icon={<Mail className="size-5" />} title="Messagerie" badge={messagingLive ? { label: "Configurée", tone: "success" } : { label: "Non configurée", tone: "warning" }}>
          {messagingLive ? `${messaging.label} : les e-mails partent réellement.` : "Les e-mails ne partent pas : chaque tentative est tracée « non transmis » dans l'historique."}
        </StatePanel>
        <StatePanel icon={<CalendarClock className="size-5" />} title="Tâche planifiée" badge={schedulerActive ? { label: "Active", tone: "success" } : { label: "Inactive", tone: "warning" }}>
          {schedulerActive ? "Chaque jour : relances de contrat à 8 h, relances automatiques à 8 h 15 (UTC)." : "CRON_SECRET n'est pas configuré sur ce serveur : rien ne part tout seul, seulement par « Lancer maintenant »."}
        </StatePanel>
        <StatePanel icon={<ToggleRight className="size-5" />} title="Règles activées" badge={enabledCount > 0 ? { label: `${enabledCount} sur ${rules.length}`, tone: "info" } : { label: "Aucune", tone: "neutral" }}>
          {enabledCount > 0 ? "Les règles activées partent au passage quotidien ou avec « Lancer maintenant »." : "Rien ne part automatiquement, hors relances de contrat. Activez une règle pour commencer."}
        </StatePanel>
      </div>

      <Alert tone="info" title="Deux garde-fous permanents">
        Une règle ne rattrape que ce qui est échu depuis moins de {CATCH_UP_DAYS} jours ; chaque relance part une seule fois par officine et par occurrence.
      </Alert>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Chaque tuile ouvre l'historique filtré comme elle : la liste affiche le même chiffre. */}
        <KpiTile label="E-mails automatiques envoyés" value={overview.automaticEmailsSent} hint="30 derniers jours, contrats compris" href={relancesTileHref("automaticEmailsSent")} />
        <KpiTile label="Alertes internes" value={overview.internalAlerts} hint="30 derniers jours" href={relancesTileHref("internalAlerts")} tone={overview.internalAlerts > 0 ? "brand" : "default"} />
        <KpiTile label="Relances ignorées" value={overview.skipped} hint="30 derniers jours : sans destinataire, sans information ou déjà envoyées à la main" href={relancesTileHref("skipped")} tone={overview.skipped > 0 ? "warning" : "default"} />
        <KpiTile label="Échecs d'envoi" value={overview.automaticFailures} hint="30 derniers jours" href={relancesTileHref("automaticFailures")} tone={overview.automaticFailures > 0 ? "danger" : "default"} />
      </div>

      <nav aria-label="Scénarios" className="flex flex-wrap gap-1.5">
        {SECTIONS.map((section) => {
          const count = section.key === "CONTRACT" ? (policy.enabled ? 1 : 0) : rules.filter((r) => r.scenario === section.key && r.enabled).length;
          return (
            <a key={section.key} href={`#${section.anchor}`} className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-card px-3 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-brand-300 hover:text-text-primary">
              {section.label}
              {count > 0 && <span className="size-1.5 rounded-full bg-success-500" aria-label="au moins une règle active" />}
            </a>
          );
        })}
      </nav>

      {SECTIONS.map((section) => {
        if (section.key === "CONTRACT") {
          return (
            <AdminSection
              key={section.key}
              id={section.anchor}
              className="scroll-mt-32"
              title="Contrat"
              description="La cadence des contrats : elle relance les contrats envoyés et non signés, puis alerte l'équipe et le commercial. Elle se règle uniquement ici."
              action={<Badge tone={policy.enabled ? "success" : "neutral"}>{policy.enabled ? "En service" : "Désactivée"}</Badge>}
            >
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <ContractCadenceForm initial={policy} schedulerActive={schedulerActive} />
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <KpiTile label="En attente de signature" value={overview.contractsAwaitingSignature} href="/admin/contrats?statut=a-signer" />
                    <KpiTile label="Relances envoyées" value={overview.contractRemindersSent} hint="30 derniers jours" href={relancesTileHref("contractRemindersSent")} />
                  </div>
                  <p className="text-[12.5px] leading-5 text-text-secondary">
                    <FileSignature className="mr-1 inline size-4 align-[-3px] text-text-tertiary" aria-hidden="true" />
                    Texte envoyé : le modèle{" "}
                    <Link href="/admin/emails/modeles/contract.reminder" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
                      {contractTemplate?.label ?? "Contrat — relance de signature"}
                    </Link>{" "}
                    {contractTemplate?.customized ? "(personnalisé)." : "s'il est personnalisé ; sinon, l'e-mail de relance historique. Le lien de signature est toujours celui du contrat."}
                  </p>
                  <div className="space-y-2">
                    <p className="text-[12px] font-medium text-text-tertiary">Dernières relances de contrat</p>
                    {overview.recentContractReminders.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border-subtle px-3 py-2.5 text-[12.5px] text-text-tertiary">Aucune relance de contrat pour l&apos;instant.</p>
                    ) : (
                      <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                        {overview.recentContractReminders.map((r) => {
                          const href = r.pharmacyId ? `/admin/pharmacies/${r.pharmacyId}?onglet=contrats` : r.prospectId ? `/admin/dossiers/${r.prospectId}` : null;
                          return (
                            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                              <span className="w-[118px] shrink-0 text-[12px] text-text-tertiary tabular-nums">{formatDateTime(r.createdAt)}</span>
                              <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                                {href ? (
                                  <Link href={href} className="hover:underline">
                                    {r.pharmacyName ?? r.recipient}
                                  </Link>
                                ) : (
                                  (r.pharmacyName ?? r.recipient)
                                )}
                                <span className="text-text-tertiary"> · {DISPATCH_TRIGGER_LABELS[r.trigger ?? "SYSTEM"] ?? r.trigger}</span>
                              </span>
                              <StatusBadge status={dispatchStatusLabel(r.status)} />
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </AdminSection>
          );
        }
        const scenario = AUTOMATION_SCENARIOS[section.key];
        const scenarioRules = rules.filter((r) => r.scenario === section.key);
        const active = scenarioRules.filter((r) => r.enabled).length;
        return (
          <AdminSection
            key={section.key}
            id={section.anchor}
            className="scroll-mt-32"
            title={scenario.label}
            description={scenario.description}
            action={<Badge tone={active > 0 ? "success" : "neutral"}>{active > 0 ? `${active} sur ${scenarioRules.length} activée${active > 1 ? "s" : ""}` : "Tout est désactivé"}</Badge>}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {scenarioRules.map((rule) => (
                <RuleCard key={rule.key} rule={rule} template={templateOf(rule)} recent={recentOf(rule)} messagingLive={messagingLive} schedulerActive={schedulerActive} />
              ))}
            </div>
          </AdminSection>
        );
      })}
    </>
  );
}
