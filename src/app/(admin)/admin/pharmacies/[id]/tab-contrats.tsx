import Link from "next/link";
import { FileSignature } from "lucide-react";
import type { Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import { AdminSection } from "@/components/admin/page-header";
import { RemindContractButton } from "@/components/admin/remind-contract-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { Stack } from "../client-ui";
import { ContractPdfLink, ContractStatusBadge } from "./shared";

/** Toutes les versions de contrat : celles du dossier commercial et celles rattachées à l'officine. */
export function ContractsTab({ base, now }: { base: Pharmacy360; now: Date }) {
  const { contracts, pharmacy } = base;
  const dossierHref = pharmacy.prospect ? `/admin/dossiers/${pharmacy.prospect.id}` : `/admin/abonnements/${pharmacy.id}`;
  const action = (
    <Button asChild size="sm" variant="outline">
      <Link href={dossierHref}>{pharmacy.prospect ? "Ouvrir le dossier" : "Préparer un contrat"}</Link>
    </Button>
  );

  if (contracts.length === 0) {
    return (
      <AdminSection>
        <EmptyState icon={<FileSignature className="size-5" />} title="Aucun contrat pour l'instant" description="Le contrat se prépare et s'envoie depuis le dossier de l'officine." action={action} />
      </AdminSection>
    );
  }

  const soon = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  return (
    <AdminSection title={`${contracts.length} version${contracts.length > 1 ? "s" : ""} de contrat`} description="De la plus récente à la plus ancienne." action={action} padded={false}>
      <TableWrapper className="rounded-none border-0">
        <Table>
          <THead>
            <TR>
              <TH>Contrat</TH>
              <TH>Statut</TH>
              <TH>Conditions</TH>
              <TH>Envoi</TH>
              <TH>Signature</TH>
              <TH>Relances</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {contracts.map((c) => {
              const waiting = c.status === "SENT" || c.status === "OPENED";
              const expiringSoon = waiting && c.expiresAt && c.expiresAt.getTime() <= soon;
              return (
                <TR key={c.id}>
                  <TD>
                    <Stack primary={<span className="font-medium">Version {c.version}</span>} secondary={[c.reference, c.plan?.name].filter(Boolean).join(" · ") || `Créé le ${formatFrenchDate(c.createdAt)}`} />
                  </TD>
                  <TD>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <ContractStatusBadge status={c.status} />
                      {c.escalatedAt && waiting && <Badge tone="warning">Signalé à l&apos;équipe</Badge>}
                      {expiringSoon && <Badge tone="warning">Expire bientôt</Badge>}
                    </span>
                    {c.expiresAt && waiting && <span className="mt-1 block text-[12px] text-text-tertiary">Expire le {formatFrenchDate(c.expiresAt)}</span>}
                  </TD>
                  <TD>
                    <Stack primary={`${formatEuros(c.monthlyPriceCents)} HT/mois`} secondary={`${c.durationMonths} mois${c.trialDays > 0 ? ` · ${c.trialDays} j d'essai` : ""}`} />
                  </TD>
                  <TD>
                    <Stack primary={c.sentAt ? formatFrenchDate(c.sentAt) : "Non envoyé"} secondary={c.openedAt ? `Consulté le ${formatFrenchDate(c.openedAt)}` : c.sentAt ? c.pharmacySignerEmail : undefined} />
                  </TD>
                  <TD>
                    {c.refusedAt ? (
                      <Stack primary={`Refusé le ${formatFrenchDate(c.refusedAt)}`} secondary={c.refusalReason ?? undefined} />
                    ) : (
                      <Stack primary={c.finalizedAt ? `Finalisé le ${formatFrenchDate(c.finalizedAt)}` : c.pharmacySignedAt ? `Officine : ${formatFrenchDate(c.pharmacySignedAt)}` : "—"} secondary={c.companySignedAt ? `Société : ${formatFrenchDate(c.companySignedAt)}` : undefined} />
                    )}
                  </TD>
                  <TD>
                    <Stack primary={c.reminderCount > 0 ? `${c.reminderCount} relance${c.reminderCount > 1 ? "s" : ""}` : "Aucune"} secondary={c.lastReminderAt ? `Dernière le ${formatFrenchDate(c.lastReminderAt)}` : undefined} />
                  </TD>
                  <TD>
                    <span className="flex flex-wrap items-center justify-end gap-3">
                      <ContractPdfLink contractId={c.id} />
                      {waiting && <RemindContractButton contractId={c.id} signerEmail={c.pharmacySignerEmail} reminderCount={c.reminderCount} />}
                    </span>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableWrapper>
    </AdminSection>
  );
}
