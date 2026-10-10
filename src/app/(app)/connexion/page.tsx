import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadConnectionOverview } from "@/server/services/connection-overview";
import { loadRobotSetup } from "@/server/services/robot-setup";
import { installerStatus } from "@/server/services/installer-file";
import { listComptoirs, listMembers } from "@/server/services/comptoirs";
import type { OverviewSnapshot } from "@/server/actions/stock-sync";
import { ConnectionSetup } from "./setup";

export const metadata: Metadata = { title: "Mes connexions" };

/**
 * « Installer PharmaBoost » — une page courte, trois blocs : installer sur mes comptoirs, envoyer mon stock,
 * connecter mon robot (facultatif). Elle remplace « Mise en service », « Connecter mon logiciel » et l'assistant
 * d'accueil.
 *
 * Tout ce qui est technique — l'état détaillé, le test de connexion, les dossiers d'export, le serveur, les codes,
 * les paramètres et le diagnostic du robot — n'est plus ici : c'est l'espace d'assistance de la console PharmaBoost
 * (fiche officine, onglet Technique), réservé aux administrateurs de la plateforme. Rien n'a été supprimé.
 */
export default async function ConnectPage() {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const [loaded, robot, installer, comptoirs, members] = await Promise.all([loadConnectionOverview(session.scope.pharmacyId), loadRobotSetup(session.scope.pharmacyId), installerStatus(), listComptoirs(session.scope.pharmacyId), listMembers(session.scope.pharmacyId)]);
  // Qui travaille à quel comptoir : l'écran de chaque collaborateur en dépend.
  const assignments = Object.fromEntries(comptoirs.map((post) => [post.id, post.assignedUserId]));
  const snapshot = JSON.parse(JSON.stringify({ overview: loaded.overview, lgo: loaded.lgo })) as OverviewSnapshot;

  return (
    <div className="mx-auto w-full max-w-2xl pb-20">
      <ConnectionSetup initial={snapshot} robot={robot} installerAvailable={installer.available} members={members.map((member) => ({ id: member.id, name: member.name }))} assignments={assignments} />
    </div>
  );
}
