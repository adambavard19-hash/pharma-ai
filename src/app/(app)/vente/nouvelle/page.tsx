import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getOCRProvider } from "@/server/ai/registry";
import { DEMO_SCENARIOS } from "@/core/ai/providers/mock-ocr";
import { isDemoMode } from "@/config/env";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { NewPrescriptionForm } from "./new-prescription-form";

export const metadata: Metadata = { title: "Nouvelle vente" };

export default async function NewPrescriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const params = await searchParams;

  const patients = await prisma.patient.findMany({
    where: { pharmacyId: session.scope.pharmacyId, deletedAt: null },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, reference: true },
    take: 300,
  });

  const ocr = getOCRProvider();
  const simulated = ocr.info.capability === "SIMULATED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>

      <PageHeader
        title="Nouvelle vente"
        description="Importez l'ordonnance. Vous vérifierez chaque élément extrait avant toute analyse."
      />

      {/* Une limite réelle du moteur ne se replie jamais : sans cette phrase,
          l'écran laisserait croire que le document déposé a été lu. Seul le
          CHOIX du scénario a quitté le parcours, pas l'avertissement. */}
      {simulated && (
        <Alert tone="warning" title="Extraction simulée">
          Aucun moteur d&apos;extraction réel n&apos;est branché sur cet environnement. Le
          fichier que vous déposez est bien enregistré, mais il n&apos;est PAS analysé : un
          scénario fictif prédéfini est restitué pour dérouler le parcours complet.
        </Alert>
      )}

      <NewPrescriptionForm
        patients={patients}
        preselectedPatientId={params.patient ?? null}
        simulated={simulated}
        scenarios={
          isDemoMode()
            ? DEMO_SCENARIOS.map((scenario) => ({
                id: scenario.id,
                label: scenario.label,
                description: scenario.description,
                drugCount: scenario.lines.length,
              }))
            : []
        }
      />

      {/* Les mentions d'hébergement restent accessibles à tout moment, mais
          hors du chemin : elles ne changent rien au geste du comptoir, et elles
          occupaient un bloc permanent au-dessus du bouton d'import. */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-text-tertiary transition-colors hover:text-text-secondary">
          <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
          Une ordonnance est une donnée de santé — hébergement et conservation
        </summary>
        <p className="mt-2 pl-[1.375rem] text-[12.5px] leading-5 text-text-secondary">
          Le fichier importé est conservé pour la traçabilité de l&apos;analyse. En production,
          il doit être hébergé chez un hébergeur agréé HDS, avec une durée de conservation
          définie. Aucune donnée extraite n&apos;est exploitée avant votre vérification.
        </p>
      </details>
    </div>
  );
}
