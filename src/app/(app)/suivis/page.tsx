import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Suivis" };

/**
 * Suivis / rappels — le troisième pilier de Pharma.ai.
 *
 * L'écran existe dès maintenant parce que la navigation le désigne, mais il
 * n'affiche rien de faux : aucun rappel n'est encore possible, la base ne
 * comporte pas de modèle `Reminder`. Cette page dit exactement cela plutôt que
 * de simuler une liste vide qui laisserait croire qu'il n'y a personne à
 * rappeler.
 */
export default async function FollowUpsPage() {
  await requirePermission(PERMISSIONS.PATIENT_VIEW);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Suivis et rappels"
        description="Les patients à recontacter aujourd'hui : fin de cure, renouvellement, contrôle de tolérance."
      />

      <Alert tone="neutral" title="Module en cours de construction">
        Cet écran affichera la liste de travail du jour : un patient, la raison du rappel, le
        message proposé, et trois actions — envoyer, reporter, annuler. Rien ne partira sans un
        clic : l&apos;envoi automatique transformerait le suivi en campagne. Aucun rappel
        n&apos;existe pour l&apos;instant, la base n&apos;en comporte pas encore la notion.
      </Alert>

      <Card>
        <CardContent>
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="Aucun rappel programmé"
            description="Les rappels seront créés à la fin d'une vente, à partir d'un fait enregistré — une cure qui se termine, un renouvellement daté — et jamais d'un profil déduit."
          />
        </CardContent>
      </Card>
    </div>
  );
}
