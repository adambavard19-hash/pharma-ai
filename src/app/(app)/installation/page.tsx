import { redirect } from "next/navigation";

/**
 * « Mise en service » est devenue « Connecter ma pharmacie » : un seul parcours
 * pour le logiciel, le stock et le poste de comptoir. Les anciens liens (e-mails,
 * favoris) arrivent ici et sont renvoyés à la page unique.
 */
export default function InstallationPage() {
  redirect("/connexion");
}
