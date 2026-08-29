import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";

/**
 * L'écran de vente — point d'entrée unique du comptoir.
 *
 * Aujourd'hui (lot 0) cette adresse redirige vers l'étape en cours du parcours
 * historique : l'URL définitive existe déjà et tous les liens la visent, mais
 * l'écran unique n'est pas encore assemblé. Le lot 1 remplace cette redirection
 * par les trois zones (ordonnance / sécurité / conseils) sans qu'aucun lien de
 * l'application n'ait à changer.
 */
export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VIEW);

  const prescription = await prisma.prescription.findUnique({
    where: { id },
    select: { id: true, pharmacyId: true, verifiedAt: true },
  });

  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) notFound();

  redirect(
    prescription.verifiedAt
      ? `/ordonnances/${prescription.id}/copilote`
      : `/ordonnances/${prescription.id}/verification`,
  );
}
