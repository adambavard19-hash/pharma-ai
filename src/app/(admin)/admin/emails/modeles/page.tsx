import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock, Mail, PenLine } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadTemplateOverrides } from "@/server/services/admin/email-templates";
import { loadRules } from "@/server/services/admin/automations";
import { loadReminderPolicy } from "@/server/services/platform-settings";
import { adminNames } from "@/server/services/admin/communications";
import { EMAIL_TEMPLATES, SYSTEM_EMAILS, type EmailTemplateCategory } from "@/core/admin/email-templates";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Modèles d'e-mails" };

const CATEGORY_ORDER: EmailTemplateCategory[] = ["Essai", "Contrat", "Abonnement", "Paiement", "Résiliation", "Commercial", "Message"];

const CATEGORY_HINT: Record<EmailTemplateCategory, string> = {
  Essai: "Accompagner l'officine pendant son essai gratuit.",
  Contrat: "Relancer un contrat envoyé et non signé.",
  Abonnement: "Confirmer un abonnement, depuis la fiche d'une officine.",
  Paiement: "Relancer après un paiement échoué resté impayé.",
  Résiliation: "Accuser réception d'une demande, puis la confirmer.",
  Commercial: "Relancer un prospect.",
  Message: "Écrire librement, depuis la console.",
};

/**
 * Le centre de modèles : les textes que l'équipe peut réécrire, rangés par
 * usage, et — en lecture seule — les e-mails système qui partent aussi.
 */
export default async function EmailTemplatesPage() {
  await requirePlatformSession();
  const [overrides, rules, contractPolicy] = await Promise.all([loadTemplateOverrides(), loadRules(), loadReminderPolicy()]);
  const authors = await adminNames([...overrides.values()].map((o) => o.updatedByAdminId));
  const customizedCount = EMAIL_TEMPLATES.filter((t) => overrides.has(t.key)).length;
  const automatedCount = new Set([...rules.map((r) => r.templateKey).filter(Boolean), "contract.reminder"]).size;

  /** Qui envoie ce modèle : les règles qui l'utilisent, la cadence des contrats (active seulement si elle est en service), ou l'envoi manuel seulement. */
  const usedBy = (key: string) => {
    const list = rules.filter((r) => r.templateKey === key).map((r) => ({ label: r.label, active: r.enabled, inactiveLabel: "désactivée" }));
    if (key === "contract.reminder") list.push({ label: "Relances de contrat", active: contractPolicy.enabled, inactiveLabel: "désactivées" });
    return list;
  };

  return (
    <>
      <AdminPageHeader
        space={{ label: "Communication", href: "/admin/communications" }}
        title="Modèles d'e-mails"
        description="Les textes des relances et des messages envoyés depuis la console. Le gabarit PharmaBoost (logo, pied de page légal) et les boutons d'action restent fixes : vous réécrivez le texte, pas les liens."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Modèles modifiables" value={EMAIL_TEMPLATES.length} icon={<PenLine className="size-4" />} />
        <KpiTile label="Personnalisés" value={customizedCount} hint={customizedCount ? "Texte réécrit par l'équipe" : "Tous au texte par défaut"} tone={customizedCount ? "brand" : "default"} />
        <KpiTile label="Utilisés par une relance" value={automatedCount} hint="Règles automatiques et contrats" href="/admin/relances" />
        <KpiTile label="E-mails système" value={SYSTEM_EMAILS.length} hint="Non modifiables, listés plus bas" icon={<Lock className="size-4" />} />
      </div>

      {CATEGORY_ORDER.map((category) => {
        const templates = EMAIL_TEMPLATES.filter((t) => t.category === category);
        if (templates.length === 0) return null;
        return (
          <AdminSection key={category} title={category} description={CATEGORY_HINT[category]} padded={false}>
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <THead>
                  <TR>
                    <TH>Modèle</TH>
                    <TH>Public</TH>
                    <TH>Envoyé par</TH>
                    <TH>Texte</TH>
                    <TH>Dernière modification</TH>
                    <TH className="text-right">
                      <span className="sr-only">Action</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {templates.map((template) => {
                    const override = overrides.get(template.key);
                    const senders = usedBy(template.key);
                    return (
                      <TR key={template.key} interactive>
                        <TD className="w-[36%] whitespace-normal">
                          <Link href={`/admin/emails/modeles/${template.key}`} className="font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">
                            {template.label}
                          </Link>
                          <p className="mt-0.5 text-[12.5px] leading-5 text-text-secondary">{template.usage}</p>
                        </TD>
                        <TD>
                          <Badge tone={template.audience === "Prospect" ? "accent" : "neutral"}>{template.audience}</Badge>
                        </TD>
                        <TD className="whitespace-normal">
                          {senders.length === 0 ? (
                            <span className="text-[12.5px] text-text-tertiary">Envoi manuel uniquement</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {senders.map((s) => (
                                <Badge key={s.label} tone={s.active ? "success" : "neutral"}>
                                  {s.label}
                                  {s.active ? "" : ` (${s.inactiveLabel})`}
                                </Badge>
                              ))}
                            </span>
                          )}
                        </TD>
                        <TD>
                          <Badge tone={override ? "brand" : "neutral"}>{override ? "Personnalisé" : "Texte par défaut"}</Badge>
                        </TD>
                        <TD className="text-[12.5px] text-text-secondary">
                          {override ? (
                            <>
                              <span className="tabular-nums">{formatDateTime(override.updatedAt)}</span>
                              {override.updatedByAdminId && authors.get(override.updatedByAdminId) && <span className="block text-text-tertiary">par {authors.get(override.updatedByAdminId)}</span>}
                            </>
                          ) : (
                            <span className="text-text-tertiary">Jamais modifié</span>
                          )}
                        </TD>
                        <TD className="text-right">
                          <Link href={`/admin/emails/modeles/${template.key}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline dark:text-brand-400">
                            Modifier
                            <ArrowRight className="size-3.5" aria-hidden="true" />
                          </Link>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </AdminSection>
        );
      })}

      <AdminSection title="E-mails système" description="Ils partent aussi, automatiquement, mais ne se modifient pas depuis la console." padded={false}>
        <div className="border-b border-border-subtle p-5">
          <Alert tone="neutral" icon={<Lock className="size-4" />}>
            Ces e-mails sont écrits dans le code : ils portent des liens de signature, d&apos;accès ou de sécurité qu&apos;une saisie ne doit jamais pouvoir casser. Chaque envoi reste tracé dans l&apos;
            <Link href="/admin/communications?type=email" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
              historique des communications
            </Link>
            .
          </Alert>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <THead>
              <TR>
                <TH>E-mail</TH>
                <TH>Quand il part</TH>
                <TH>Destinataire</TH>
                <TH>Modification</TH>
              </TR>
            </THead>
            <TBody>
              {SYSTEM_EMAILS.map((email) => (
                <TR key={email.label}>
                  <TD className="w-[34%] whitespace-normal">
                    <span className="inline-flex items-start gap-2 font-medium">
                      <Mail className="mt-0.5 size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                      {email.label}
                    </span>
                  </TD>
                  <TD className="w-[34%] whitespace-normal text-[13px] text-text-secondary">{email.trigger}</TD>
                  <TD className="text-[13px] text-text-secondary">{email.recipient}</TD>
                  <TD>
                    <Badge tone="neutral" icon={<Lock className="size-3" aria-hidden="true" />}>
                      Non modifiable
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </AdminSection>
    </>
  );
}
