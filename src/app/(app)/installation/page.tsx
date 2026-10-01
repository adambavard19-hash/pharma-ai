import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getConnection } from "@/server/services/stock-sync";
import { LGO_DEFINITIONS } from "@/core/stock/connectors";
import { loadInstallationState } from "@/app/api/installation/etat/route";
import { InstallationGuide } from "./installation-guide";

export const metadata: Metadata = { title: "Mettre PharmaBoost en service" };

/**
 * Le guide de mise en service, pas à pas, pour le titulaire seul devant son
 * poste. Chaque étape dit quoi faire, où cliquer, ce qu'on doit voir, et quoi
 * faire si ça bloque. L'état se relit tout seul : le poste relié apparaît
 * sans recharger la page.
 */
export default async function InstallationPage() {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const [state, connection] = await Promise.all([loadInstallationState(session.scope.pharmacyId), getConnection(session.scope.pharmacyId)]);
  const lgo = connection ? LGO_DEFINITIONS.find((item) => item.id === connection.lgo) ?? null : null;
  return (
    <InstallationGuide
      initial={state}
      firstName={session.user.firstName}
      pharmacyName={session.pharmacy.name}
      lgo={lgo ? { id: lgo.id, label: lgo.label, exportHint: lgo.exportHint, exportSteps: lgo.exportSteps } : null}
    />
  );
}
