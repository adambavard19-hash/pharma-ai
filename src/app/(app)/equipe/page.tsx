import { redirect } from "next/navigation";

/** L'équipe est un réglage d'officine, pas un écran de comptoir. */
export default function LegacyTeamPage() {
  redirect("/parametres/equipe");
}
