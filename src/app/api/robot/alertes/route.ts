import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadRobotAlerts } from "@/server/services/robot-alerts";

export const dynamic = "force-dynamic";

/**
 * Les alertes du robot du logiciel (menu et coin de l'écran) : ce qui demande l'attention de la personne, par la portée
 * de sa session et selon ses permissions. Lu au chargement, puis toutes les quelques minutes et à chaque changement de
 * page (au plus une fois par minute). Aucune donnée de patient.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const alerts = await loadRobotAlerts({
    scope: session.scope,
    role: session.role,
    isDemo: session.pharmacy.isDemo,
    permissions: {
      manageTeam: session.permissions.has(PERMISSIONS.TEAM_MANAGE),
      updateStock: session.permissions.has(PERMISSIONS.PRODUCT_IMPORT),
      manageSettings: session.permissions.has(PERMISSIONS.SETTINGS_MANAGE),
    },
  }).catch((error: unknown) => {
    console.error("[robot] alertes impossibles", error);
    return [];
  });
  return NextResponse.json({ alerts }, { headers: { "Cache-Control": "no-store" } });
}
