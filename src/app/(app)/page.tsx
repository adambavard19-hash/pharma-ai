import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { PERMISSIONS } from "@/server/rbac/permissions";

/**
 * L'accueil, c'est le comptoir.
 *
 * Il n'y a plus d'écran intermédiaire : quelqu'un qui ouvre PharmaBoost a un
 * patient devant lui, pas un menu à parcourir. On économise un clic et une
 * décision. Le reste de l'application reste dans la barre latérale.
 *
 * Le repli sur les patients couvre les profils qui n'ont pas le droit de
 * créer une délivrance — les envoyer sur un écran interdit serait un beau
 * gain de clic pour un mur.
 */
export default async function HomePage() {
  const session = await requireSession();

  // Un titulaire dont l'officine n'a ni terminé l'accueil ni importé son stock
  // est conduit à l'accueil : sans stock, le comptoir ne proposerait rien.
  if (session.role === "OWNER") {
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: session.scope.pharmacyId },
      select: { onboardingCompletedAt: true, stockSyncedAt: true, isDemo: true },
    });
    if (pharmacy && !pharmacy.isDemo && !pharmacy.onboardingCompletedAt && !pharmacy.stockSyncedAt) {
      redirect("/bienvenue");
    }
  }

  if (session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE)) {
    redirect("/vente/nouvelle");
  }
  redirect("/patients");
}
