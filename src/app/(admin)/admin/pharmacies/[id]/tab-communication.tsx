import Link from "next/link";
import { Mail } from "lucide-react";
import { loadCommunicationTab, type Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import type { ContactTemplate } from "@/server/services/admin/email-templates";
import { AdminSection } from "@/components/admin/page-header";
import { ContactDialog } from "@/components/admin/contact-dialog";
import { DispatchStatusBadge, StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DISPATCH_KIND_LABELS, DISPATCH_TRIGGER_LABELS } from "@/core/admin/statuses";
import { emailTemplate } from "@/core/admin/email-templates";
import { truncate } from "@/core/admin/clients";
import { formatDateTime } from "@/lib/format";
import { Stack } from "../client-ui";
import { EmptyLine } from "./shared";

const NOTIFICATION_TONES = { INFO: "info", SUCCESS: "success", WARNING: "warning", CRITICAL: "danger" } as const;
const NOTIFICATION_LABELS = { INFO: "Information", SUCCESS: "Succès", WARNING: "Attention", CRITICAL: "Critique" } as const;

/** Les e-mails envoyés à l'officine ou à son dossier, et les notifications de l'équipe qui la concernent. */
export async function CommunicationTab({ base, templates }: { base: Pharmacy360; templates: ContactTemplate[] }) {
  const { pharmacy } = base;
  const data = await loadCommunicationTab(base);

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
