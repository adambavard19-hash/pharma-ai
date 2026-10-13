import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadConnectionOverview } from "@/server/services/connection-overview";
import { installerStatus } from "@/server/services/installer-file";
import { listComptoirs, listMembers } from "@/server/services/comptoirs";
import type { OverviewSnapshot } from "@/server/actions/stock-sync";
import { PageHeader } from "@/components/ui/page";
import { SettingsTabs } from "../settings-tabs";
import { PostsPanel } from "./posts-panel";

export const metadata: Metadata = { title: "Postes du comptoir" };

/**
 * « Postes du comptoir » (Paramètres) : ce qui restait d'indispensable de l'ancienne page « Mes comptoirs » — installer
 * PharmaBoost sur un nouvel ordinateur, voir lesquels sont connectés ou hors ligne, les nommer, dire qui y travaille, en retirer
 * un. L'envoi du stock vit dans « Mon stock » (Mettre à jour mon stock) ; le robot se connecte seul ; le technique (dossier
 * d'export d'un poste, serveur, diagnostic) reste dans l'espace d'assistance de la console PharmaBoost.
 */
export default async function PostsPage() {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const [loaded, installer, comptoirs, members] = await Promise.all([loadConnectionOverview(session.scope.pharmacyId), installerStatus(), listComptoirs(session.scope.pharmacyId), listMembers(session.scope.pharmacyId)]);
  const assignments = Object.fromEntries(comptoirs.map((post) => [post.id, post.assignedUserId]));
  const snapshot = JSON.parse(JSON.stringify({ overview: loaded.overview, lgo: loaded.lgo })) as OverviewSnapshot;

  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description="Officine, équipe, préférences de conseil, moteur et conformité — tout ce qui se règle une fois, pas à chaque patient." />
      <SettingsTabs
        canSeeTeam={session.permissions.has(PERMISSIONS.TEAM_VIEW)}
        canSeeRules={session.permissions.has(PERMISSIONS.RECOMMENDATION_VIEW)}
        canSeeAudit={session.permissions.has(PERMISSIONS.AUDIT_VIEW)}
        canSeePosts
      />
      <div className="max-w-3xl">
        <PostsPanel initial={snapshot} installerAvailable={installer.available} members={members.map((member) => ({ id: member.id, name: member.name }))} assignments={assignments} />
      </div>
    </div>
  );
}
