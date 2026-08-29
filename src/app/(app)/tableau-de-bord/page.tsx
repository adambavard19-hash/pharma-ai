import { redirect } from "next/navigation";

/**
 * Ancienne vue d'ensemble, devenue la page Performance.
 *
 * Elle a quitté le menu : au comptoir on ne consulte pas un tableau de bord, on
 * scanne une ordonnance. Les chiffres restent à un clic depuis l'accueil.
 */
export default function LegacyDashboardPage() {
  redirect("/performance");
}
