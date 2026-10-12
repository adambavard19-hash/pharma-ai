import "server-only";
import type { SessionContext } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import type { AlertViewer } from "@/server/services/robot-alerts";
import type { PharmacyViewer } from "@/core/pharmacy-assistant/assistant";

/** Ce que la session permet de faire lire au robot (l'officine active, les permissions de la personne). */
export function viewersOf(session: SessionContext): { viewer: PharmacyViewer; alertViewer: AlertViewer } {
  const has = (permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) => session.permissions.has(permission);
  return {
    viewer: {
      role: session.role,
      manageTeam: has(PERMISSIONS.TEAM_MANAGE),
      teamPerformance: has(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE),
      stock: has(PERMISSIONS.STOCK_VIEW),
    },
    alertViewer: {
      scope: session.scope,
      role: session.role,
      isDemo: session.pharmacy.isDemo,
      permissions: { manageTeam: has(PERMISSIONS.TEAM_MANAGE), updateStock: has(PERMISSIONS.PRODUCT_IMPORT), manageSettings: has(PERMISSIONS.SETTINGS_MANAGE) },
    },
  };
}
