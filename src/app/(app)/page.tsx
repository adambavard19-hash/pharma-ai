import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";

/**
 * L'accueil, c'est le comptoir.
 *
 * Il n'y a plus d'écran intermédiaire : quelqu'un qui ouvre Pharma.ai a un
 * patient devant lui, pas un menu à parcourir. On économise un clic et une
 * décision. Le reste de l'application reste dans la barre latérale.
 *
 * Le repli sur les patients couvre les profils qui n'ont pas le droit de
 * créer une délivrance — les envoyer sur un écran interdit serait un beau
 * gain de clic pour un mur.
 */
export default async function HomePage() {
  const session = await requireSession();

  if (session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE)) {
    redirect("/vente/nouvelle");
  }
  redirect("/patients");
}
