import { redirect } from "next/navigation";

/** L'ancienne « Mise en service » (liens d'e-mails, favoris) : l'installation d'un poste vit dans Paramètres → « Postes du comptoir ». */
export default function InstallationPage() {
  redirect("/parametres/postes");
}
