import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadTemplate } from "@/server/services/admin/email-templates";
import { loadRules } from "@/server/services/admin/automations";
import { loadReminderPolicy } from "@/server/services/platform-settings";
import { adminNames } from "@/server/services/admin/communications";
import { describeOffset, isContextBoundTemplate } from "@/core/admin/automations";
import { emailTemplate } from "@/core/admin/email-templates";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { TemplateEditor } from "./template-editor";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const definition = emailTemplate(decodeURIComponent(key));
  return { title: definition ? `Modèle — ${definition.label}` : "Modèle d'e-mail" };
}

/** Un modèle d'e-mail : ce qu'il est, qui l'envoie, et son éditeur avec aperçu. */
export default async function EmailTemplatePage({ params }: { params: Promise<{ key: string }> }) {
  const session = await requirePlatformSession();
  const { key } = await params;
  const loaded = await loadTemplate(decodeURIComponent(key));
  if (!loaded) notFound();
  const { definition } = loaded;
  const [rules, authors, contractPolicy] = await Promise.all([loadRules(), adminNames([loaded.updatedByAdminId]), loadReminderPolicy()]);
  const senders = rules.filter((r) => r.templateKey === definition.key);
  const author = loaded.updatedByAdminId ? authors.get(loaded.updatedByAdminId) : null;

  return (
    <>
      <AdminPageHeader
        space={{ label: "Communication", href: "/admin/communications" }}
        parent={{ label: "Modèles d'e-mails", href: "/admin/emails/modeles" }}
        title={definition.label}
        badge={<Badge tone={loaded.customized ? "brand" : "neutral"}>{loaded.customized ? "Personnalisé" : "Texte par défaut"}</Badge>}
        description={definition.usage}
      />

      <AdminSection>
        <FactList
          className="lg:grid-cols-4"
          items={[
            { label: "Catégorie", value: definition.category },
            { label: "Destinataire", value: definition.audience === "Prospect" ? "Le contact du dossier commercial" : "Le titulaire de l'officine (à défaut, l'e-mail de l'officine)" },
            {
              label: "Envoyé par",
              value:
                senders.length > 0 || definition.key === "contract.reminder" ? (
                  <span className="flex flex-wrap gap-1">
                    {senders.map((rule) => (
                      <Link key={rule.key} href="/admin/relances" className="rounded-full focus-visible:outline-2 focus-visible:outline-brand-500">
                        <Badge tone={rule.enabled ? "success" : "neutral"}>
                          {rule.label} · {rule.enabled ? describeOffset(rule.offsetDays) : "désactivée"}
                        </Badge>
                      </Link>
                    ))}
                    {definition.key === "contract.reminder" && (
                      <Link href="/admin/relances#contrat" className="rounded-full focus-visible:outline-2 focus-visible:outline-brand-500">
                        <Badge tone={contractPolicy.enabled ? "success" : "neutral"}>Relances de contrat{contractPolicy.enabled ? "" : " · désactivées"}</Badge>
                      </Link>
                    )}
                  </span>
                ) : (
                  "Envoi manuel, depuis la fenêtre « Contacter »"
                ),
              hint:
                definition.key === "contract.reminder"
                  ? "Relance manuelle : bouton « Relancer » du contrat, qui joint le lien de signature."
                  : isContextBoundTemplate(definition.key)
                    ? "Envoi manuel depuis la page de la demande de résiliation."
                    : "Il reste aussi disponible pour un envoi manuel.",
            },
            { label: "Dernière modification", value: loaded.updatedAt ? formatDateTime(loaded.updatedAt) : "Jamais modifié", hint: author ? `par ${author}` : undefined },
          ]}
        />
        {definition.key === "contract.reminder" && (
          <p className="mt-4 border-t border-border-subtle pt-4 text-[12.5px] leading-5 text-text-secondary">
            Tant que ce modèle garde son texte par défaut, les relances de contrat partent avec l&apos;e-mail de relance historique. Dès qu&apos;il est personnalisé, c&apos;est ce texte qui part, avec le lien de signature du contrat.
          </p>
        )}
      </AdminSection>

      <TemplateEditor definition={definition} initialText={loaded.text} customized={loaded.customized} adminEmail={session.admin.email} />
    </>
  );
}
