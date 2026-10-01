import { prisma } from "@/server/db/client";
import { invitationSummary } from "@/server/services/onboarding";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataItem } from "@/components/ui/page";
import { Alert } from "@/components/ui/feedback";
import { formatDate, formatDateTime } from "@/lib/format";
import { onboardingStage } from "@/core/onboarding/stage";
import { missingContractFields } from "@/core/contracts/requirements";
import { InvitationActions } from "./invitation-actions";

/**
 * L'invitation du titulaire, sur la fiche du dossier : envoyée, ouverte,
 * complétée, et les gestes possibles à cette étape seulement.
 */
export async function InvitationPanel({ prospectId }: { prospectId: string }) {
  const [invitation, prospect] = await Promise.all([
    invitationSummary(prospectId),
    prisma.prospect.findUnique({ where: { id: prospectId }, include: { contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true, signedArchivedAt: true } } } }),
  ]);
  if (!invitation || !prospect) return null;
  const missing = missingContractFields(prospect);
  const stage = onboardingStage({ prospectStatus: prospect.status, contract: prospect.contracts[0] ?? null, invitation, missingCount: missing.length });
  const open = !invitation.completedAt && !prospect.pharmacyId;
  const failed = invitation.lastSendStatus && invitation.lastSendStatus !== "SENT";

  return (
    <Card>
      <CardHeader title="Invitation du titulaire" description="Le titulaire complète lui-même ce dossier." />
      <CardContent className="space-y-3 pb-5">
        <Badge tone={stage.tone}>{stage.label}</Badge>
        <div className="grid gap-3 text-[13px] sm:grid-cols-2">
          <DataItem label="Adresse">{invitation.email}</DataItem>
          <DataItem label="Envoyée">{invitation.sentAt ? `${formatDateTime(invitation.sentAt)}${invitation.sendCount > 1 ? ` · ${invitation.sendCount} envois` : ""}` : "pas encore"}</DataItem>
          <DataItem label="Ouverte">{invitation.openedAt ? formatDateTime(invitation.openedAt) : "pas encore"}</DataItem>
          <DataItem label={invitation.completedAt ? "Dossier complété" : "Lien valable jusqu'au"}>{invitation.completedAt ? formatDateTime(invitation.completedAt) : formatDate(invitation.expiresAt)}</DataItem>
        </div>
        {failed && <Alert tone="warning">Envoi en échec : {invitation.lastSendDetail ?? "motif inconnu"}. Corrigez l&apos;adresse si besoin, puis renvoyez.</Alert>}
        {invitation.completedAt && missing.length > 0 && <p className="text-[13px] text-text-secondary">Informations nécessaires au contrat à compléter : {missing.map((m) => m.label).join(", ")}.</p>}
        {open && <InvitationActions prospectId={prospectId} email={invitation.email} />}
      </CardContent>
    </Card>
  );
}
