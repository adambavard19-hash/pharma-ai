import Link from "next/link";
import { Mail } from "lucide-react";
import { CAMPAIGNS_RECEIVED_LIMIT, loadCampaignsReceived, loadCommunicationTab, loadNewsAggregates, type Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import type { ContactTemplate } from "@/server/services/admin/email-templates";
import { AdminSection, FactList } from "@/components/admin/page-header";
import { ContactDialog } from "@/components/admin/contact-dialog";
import { DispatchStatusBadge, StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DISPATCH_KIND_LABELS, DISPATCH_TRIGGER_LABELS } from "@/core/admin/statuses";
import { emailTemplate } from "@/core/admin/email-templates";
import { CAMPAIGN_KINDS, CAMPAIGN_RECIPIENT_STATUS_LABELS, type CampaignKindKey } from "@/core/admin/campaigns";
import { truncate } from "@/core/admin/clients";
import { formatDate, formatDateTime } from "@/lib/format";
import { Stack } from "../client-ui";
import { EmptyLine } from "./shared";

const NOTIFICATION_TONES = { INFO: "info", SUCCESS: "success", WARNING: "warning", CRITICAL: "danger" } as const;
const NOTIFICATION_LABELS = { INFO: "Information", SUCCESS: "Succès", WARNING: "Attention", CRITICAL: "Critique" } as const;

/** Les e-mails envoyés à l'officine ou à son dossier, et les notifications de l'équipe qui la concernent. */
export async function CommunicationTab({ base, templates }: { base: Pharmacy360; templates: ContactTemplate[] }) {
  const { pharmacy } = base;
  const [data, news, campaigns] = await Promise.all([loadCommunicationTab(base), loadNewsAggregates(base), loadCampaignsReceived(base)]);

  return (
    <div className="space-y-5">
      <AdminSection
        title="E-mails"
        description="Envoyés à l'officine, à son titulaire ou au contact du dossier : automatiques, manuels et transactionnels."
        action={
          <>
            <Link href={`/admin/communications?officine=${pharmacy.id}`} className="text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
              Historique complet
            </Link>
            <ContactDialog pharmacyId={pharmacy.id} templates={templates} audience="Titulaire" label="Écrire" />
          </>
        }
        padded={data.emails.length === 0}
      >
        {data.emails.length === 0 ? (
          <EmptyState icon={<Mail className="size-5" />} title="Aucun e-mail envoyé pour l'instant" description="Chaque envoi (invitation, contrat, relance, message manuel) apparaîtra ici avec son issue." />
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Objet</TH>
                  <TH>Destinataire</TH>
                  <TH>Déclencheur</TH>
                  <TH>Statut</TH>
                </TR>
              </THead>
              <TBody>
                {data.emails.map((e) => {
                  const template = e.templateKey ? emailTemplate(e.templateKey) : null;
                  return (
                    <TR key={e.id}>
                      <TD className="text-[13px] whitespace-nowrap">{formatDateTime(e.createdAt)}</TD>
                      <TD className="max-w-[22rem] whitespace-normal">
                        <Stack primary={e.subject ?? DISPATCH_KIND_LABELS[e.kind] ?? e.kind} secondary={template ? `Modèle : ${template.label}` : e.subject ? (DISPATCH_KIND_LABELS[e.kind] ?? e.kind) : undefined} />
                      </TD>
                      <TD className="text-[13px] text-text-secondary">{e.recipient}</TD>
                      <TD>
                        <Stack primary={e.trigger ? (DISPATCH_TRIGGER_LABELS[e.trigger] ?? e.trigger) : "—"} secondary={e.sentBy ? `par ${e.sentBy}` : undefined} />
                      </TD>
                      <TD>
                        <span title={e.detail ?? undefined}>
                          <DispatchStatusBadge status={e.status} />
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </AdminSection>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <AdminSection title="Nouveautés pour les patients" description="Des effectifs seulement : aucune adresse et aucun patient ne sont visibles ici.">
          <FactList
            items={[
              { label: "Fonction", value: <Badge tone={news.enabled ? "success" : "neutral"}>{news.enabled ? "Activée" : "Désactivée par l'officine"}</Badge> },
              { label: "Abonnés actifs", value: news.activeSubscribers.toLocaleString("fr-FR") },
              { label: "Annonces envoyées", value: news.announcementsSent.toLocaleString("fr-FR"), hint: news.announcementsSimulated > 0 ? `${news.announcementsSimulated} envoi${news.announcementsSimulated > 1 ? "s simulés non comptés" : " simulé non compté"} (messagerie non configurée)` : undefined },
              { label: "Dernière annonce", value: news.lastAnnouncementAt ? formatDate(news.lastAnnouncementAt) : "Aucune" },
            ]}
          />
        </AdminSection>

        <AdminSection title="Campagnes reçues" description="Les campagnes de la console adressées à cette officine." padded={campaigns.rows.length === 0}>
          {campaigns.rows.length === 0 ? (
            <EmptyLine>Cette officine n&apos;a reçu aucune campagne.</EmptyLine>
          ) : (
            <>
              <TableWrapper className="rounded-none border-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>Campagne</TH>
                      <TH>Date</TH>
                      <TH>Statut</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {campaigns.rows.map((row) => {
                      const status = CAMPAIGN_RECIPIENT_STATUS_LABELS[row.status] ?? { label: row.status, tone: "neutral" as const };
                      const kind = Object.hasOwn(CAMPAIGN_KINDS, row.campaign.kind) ? CAMPAIGN_KINDS[row.campaign.kind as CampaignKindKey].label : row.campaign.kind;
                      return (
                        <TR key={row.id}>
                          <TD className="max-w-[16rem] whitespace-normal">
                            <Link href={`/admin/campagnes/${row.campaign.id}`} className="block truncate text-[13.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
                              {row.campaign.name}
                            </Link>
                            <span className="block text-[12px] text-text-tertiary">{kind}</span>
                          </TD>
                          <TD className="text-[13px] whitespace-nowrap">{formatDateTime(row.sentAt ?? row.createdAt)}</TD>
                          <TD>
                            <span title={row.detail ?? undefined}>
                              <StatusBadge status={status} />
                            </span>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableWrapper>
              {campaigns.total > campaigns.rows.length && <p className="border-t border-border-subtle px-4 py-2.5 text-[12px] text-text-tertiary">Les {CAMPAIGNS_RECEIVED_LIMIT} plus récentes, sur {campaigns.total.toLocaleString("fr-FR")}.</p>}
            </>
          )}
        </AdminSection>
      </div>

      <AdminSection title="Notifications de l'équipe" description="Les alertes de la plateforme qui mènent à cette officine ou à son dossier.">
        {data.notifications.length === 0 ? (
          <EmptyLine>Aucune notification liée à cette officine.</EmptyLine>
        ) : (
          <ul className="-my-2 divide-y divide-border-subtle">
            {data.notifications.map((n) => (
              <li key={n.id} className="space-y-1 py-3">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={{ label: NOTIFICATION_LABELS[n.severity], tone: NOTIFICATION_TONES[n.severity] }} />
                  <Badge tone="neutral">{n.audience === "ADMIN" ? "Équipe PharmaBoost" : "Commercial"}</Badge>
                  <span className="text-[12px] text-text-tertiary">{formatDateTime(n.createdAt)}</span>
                </span>
                <span className="block text-[13.5px] font-medium text-text-primary">{n.title}</span>
                <span className="block text-[12.5px] text-text-secondary">{truncate(n.body, 240)}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </div>
  );
}
