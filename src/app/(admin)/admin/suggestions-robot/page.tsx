import { redirect } from "next/navigation";
import { requirePlatformSession } from "@/server/auth/platform-session";

/**
 * « Suggestions du robot » a rejoint « Conseils » (13 oct. 2026) : l'ancienne adresse mène au même endroit, filtre « Proposés par
 * le robot » déjà choisi. Aucun lien cassé.
 */
export default async function RobotSuggestionsPage() {
  await requirePlatformSession();
  redirect("/admin/conseils?filtre=robot");
}
