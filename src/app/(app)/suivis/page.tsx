import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { listReminders } from "@/server/services/followup";
import { getMessagingProvider } from "@/server/ai/registry";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { FollowUpWorklist } from "./worklist";

export const metadata: Metadata = { title: "Suivis" };

/**
 * Suivis et rappels — le troisième pilier.
 *
 * Une liste de travail, pas une automatisation invisible : le pharmacien lit,
 * ajuste, envoie. C'est ce qui distingue un suivi d'officine d'une campagne, et
 * ce qui garde la responsabilité là où elle doit être.
 */
export default async function FollowUpsPage() {
  const session = await requirePermission(PERMISSIONS.FOLLOWUP_VIEW);

  const [reminders, pharmacy] = await Promise.all([
    listReminders(session.scope, { horizonDays: 14 }),
    prisma.pharmacy.findUniqueOrThrow({
      where: { id: session.scope.pharmacyId },
      select: { followUpMinIntervalDays: true },
    }),
  ]);

  const messaging = getMessagingProvider();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Suivis et rappels"
        description="Les patients à recontacter : fin de cure, renouvellement, contrôle de tolérance. Rien ne part sans votre clic."
      />

      {messaging.info.capability !== "LIVE" && (
        <Alert tone="warning" title="Aucun service d'envoi n'est branché">
          Vous pouvez dérouler tout le parcours, mais chaque envoi sera journalisé{" "}
          <strong>SIMULÉ</strong> : aucun message ne partira réellement tant qu&apos;un
          fournisseur e-mail n&apos;aura pas été configuré.
        </Alert>
      )}

      {reminders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="Aucun suivi à envoyer"
            description="Les rappels se programment à la fin d'une vente, à partir d'un fait enregistré — une cure qui se termine, un renouvellement daté — et jamais d'un profil déduit."
          />
        </Card>
      ) : (
        <FollowUpWorklist
          reminders={reminders.map((reminder) => ({
            ...reminder,
            dueAt: reminder.dueAt.toISOString(),
            sentAt: reminder.sentAt?.toISOString() ?? null,
            eligibility: reminder.eligibility.allowed
              ? { allowed: true as const }
              : {
                  allowed: false as const,
                  code: reminder.eligibility.code,
                  reason: reminder.eligibility.reason,
                },
          }))}
          canSend={session.permissions.has(PERMISSIONS.FOLLOWUP_SEND)}
          canSchedule={session.permissions.has(PERMISSIONS.FOLLOWUP_SCHEDULE)}
        />
      )}

      <Card>
        <CardContent className="space-y-1.5 py-4 text-[12.5px] leading-5 text-text-secondary">
          <p className="font-medium text-text-primary">Ce qu&apos;un suivi contient</p>
          <p>
            Ni molécule, ni pathologie, ni posologie. Le message dit que votre pharmacie a
            préparé un suivi et propose un lien sécurisé ; tout le contenu de santé reste
            derrière ce lien, à durée limitée. Chaque message porte un lien de désinscription
            qui fonctionne sans compte.
          </p>
          <p>
            Un même patient ne peut pas être sollicité plus d&apos;une fois tous les{" "}
            {pharmacy.followUpMinIntervalDays} jours. La règle est appliquée côté serveur,
            même si l&apos;écran l&apos;autorisait.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
