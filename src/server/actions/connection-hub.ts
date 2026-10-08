"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { clearRobotSetup, saveRobotIdentity } from "@/server/services/robot-setup";
import type { RobotIdentityInput, RobotSetup } from "@/core/robot/integration";
import { fail, ok, type ActionResult } from "./types";

/**
 * L'étape « Connecter mon robot » de la page « Installer PharmaBoost » : le pharmacien désigne son robot
 * (fabricant et modèle) ou le retire. Même permission que le reste de la page (import de stock, c'est-à-dire le
 * titulaire) ; l'officine est toujours celle de la session, jamais un identifiant reçu du client.
 *
 * Les paramètres techniques ne passent pas par ici : ils se règlent depuis l'espace d'assistance de la console
 * (`admin-connection.ts`). Le test de connexion et les réglages des comptoirs et du serveur y sont aussi.
 */

/** Désigne le robot de l'officine. N'ouvre aucune connexion : l'intégration n'est pas disponible. */
export async function saveRobotSetupAction(payload: RobotIdentityInput): Promise<ActionResult<RobotSetup>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const result = await saveRobotIdentity(session.scope, payload);
  if (!result.ok) return fail(result.error, result.fieldErrors);
  revalidatePath("/connexion");
  return ok(result.setup, "Robot enregistré. L'intégration n'est pas encore disponible : rien n'est lu du robot.");
}

export async function clearRobotSetupAction(): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  await clearRobotSetup(session.scope);
  revalidatePath("/connexion");
  return ok(null, "Robot retiré.");
}
