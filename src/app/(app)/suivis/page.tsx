import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { countFollowUpBoard, listReminders } from "@/server/services/followup";
import { getMessagingProvider } from "@/server/ai/registry";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { FollowUpWorklist } from "./worklist";

export const metadata: Metadata = { title: "Suivis" };

/**
 * Suivis — la liste de travail de l'équipe.
 *
 * Trois chiffres, puis les patients. Une liste de travail, pas une
 * automatisation invisible : le pharmacien lit, ajuste, envoie. C'est ce qui
 * distingue un suivi d'officine d'une campagne.
 */
export default async function FollowUpsPage() {
  const session = await requirePermission(PERMISSIONS.FOLLOWUP_VIEW);

  const [reminders, board, pharmacy] = await Promise.all([
    listReminders(session.scope, { horizonDays: 30, includeCompletedDays: 14 }),
    countFollowUpBoard(session.scope),
    prisma.pharmacy.findUniqueOrThrow({
      where: { id: session.scope.pharmacyId },
      select: { followUpMinIntervalDays: true },
    }),
  ]);

  const messaging = getMessagingProvider();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Suivis" description="Les patients dont votre officine prend des nouvelles. Rien ne part sans votre clic." />

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Aujourd'hui" value={board.today} unit={board.today > 1 ? "patients à suivre" : "patient à suivre"} tone="brand" />
        <Kpi label="À venir" value={board.upcoming} unit={board.upcoming > 1 ? "suivis programmés" : "suivi programmé"} />
        <Kpi label="Besoin d'un conseil" value={board.needAdvice} unit={board.needAdvice > 1 ? "patients à rappeler" : "patient à rappeler"} tone={board.needAdvice > 0 ? "warning" : undefined} />
      </div>

      {messaging.info.capability !== "LIVE" && (
        <Alert tone="warning" title="Aucun service d'envoi n'est branché">
          Vous pouvez dérouler tout le parcours, mais chaque envoi sera journalisé <strong>SIMULÉ</strong> : aucun message ne
          partira réellement tant qu&apos;un fournisseur e-mail n&apos;aura pas été configuré.
        </Alert>
      )}

      {reminders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="Aucun suivi pour le moment"
            description="Les suivis se proposent à la fin d'une vente, à partir d'un fait enregistré — une cure qui se termine, un renouvellement daté — jamais d'un profil déduit."
          />
        </Card>
      ) : (
        <FollowUpWorklist
          reminders={reminders.map((reminder) => ({
            id: reminder.id,
            patientId: reminder.patientId,
            patientName: reminder.patientName,
            templateLabel: reminder.templateLabel,
            purpose: reminder.purpose,
            dueAt: reminder.dueAt.toISOString(),
            status: reminder.status,
            sentAt: reminder.sentAt?.toISOString() ?? null,
            note: reminder.note,
            preview: reminder.preview,
            eligibility: reminder.eligibility.allowed
              ? { allowed: true as const }
              : { allowed: false as const, code: reminder.eligibility.code, reason: reminder.eligibility.reason },
            answer: reminder.answer ? { ...reminder.answer, at: reminder.answer.at.toISOString() } : null,
            handledAt: reminder.handledAt?.toISOString() ?? null,
          }))}
          canSend={session.permissions.has(PERMISSIONS.FOLLOWUP_SEND)}
          canSchedule={session.permissions.has(PERMISSIONS.FOLLOWUP_SCHEDULE)}
        />
      )}

      <Card>
        <CardContent className="space-y-1.5 py-4 text-[12.5px] leading-5 text-text-secondary">
          <p className="font-medium text-text-primary">Ce qu&apos;un suivi contient</p>
          <p>
            Ni molécule, ni pathologie, ni posologie. Le message dit que votre pharmacie prend des nouvelles, pose une seule
            question — « Comment allez-vous depuis votre passage ? » — avec trois réponses fermées, et propose le lien sécurisé
            vers le plan. Chaque message porte un lien de désinscription qui fonctionne sans compte.
          </p>
          <p>
            Un même patient ne peut pas être sollicité plus d&apos;une fois tous les {pharmacy.followUpMinIntervalDays} jours. La
            règle est appliquée côté serveur, même si l&apos;écran l&apos;autorisait.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, unit, tone }: { label: string; value: number; unit: string; tone?: "brand" | "warning" }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">{label}</p>
        <p
          className={
            "mt-1 text-[30px] leading-none font-semibold tabular " +
            (tone === "warning" ? "text-warning-700 dark:text-warning-500" : tone === "brand" ? "text-brand-700 dark:text-brand-400" : "text-text-primary")
          }
        >
          {value}
        </p>
        <p className="mt-1 text-[12.5px] text-text-secondary">{unit}</p>
      </CardContent>
    </Card>
  );
}
