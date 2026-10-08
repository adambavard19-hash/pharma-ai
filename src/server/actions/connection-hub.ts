"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadConnectionOverview } from "@/server/services/connection-overview";
import { clearRobotSetup, loadRobotSetup, saveRobotSetup } from "@/server/services/robot-setup";
import { buildConnectionTest, type ConnectionTestResult } from "@/core/stock/connection-test";
import { lgoLabel } from "@/core/stock/connectors";
import { LATEST_AGENT_VERSION } from "@/core/admin/agent-version";
import type { RobotSetup, RobotSetupInput } from "@/core/robot/integration";
import type { Serialized } from "./stock-sync";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les actions de la page « Ma connexion » : le test de connexion et la désignation du robot.
 * Même permission que le reste de la page (import de stock, c'est-à-dire le titulaire) ; l'officine
 * est toujours celle de la session, jamais un identifiant reçu du client.
 */

export type ConnectionTestSnapshot = Serialized<ConnectionTestResult>;

/**
 * « Tester ma connexion » : relit tout d'un coup et rend les contrôles. Lecture seule — le test ne
 * change rien, ne contacte aucun ordinateur de l'officine et n'écrit rien dans le logiciel.
 */
export async function testConnectionAction(): Promise<ActionResult<ConnectionTestSnapshot>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const now = new Date();
  const [loaded, robot] = await Promise.all([loadConnectionOverview(session.scope.pharmacyId, now), loadRobotSetup(session.scope.pharmacyId)]);
  const result = buildConnectionTest({
    now,
    lgo: loaded.lgo,
    lgoLabel: loaded.lgo ? lgoLabel(loaded.lgo) : null,
    overview: loaded.overview,
    connection: loaded.connection,
    posts: loaded.posts,
    latestAgentVersion: LATEST_AGENT_VERSION,
    robot,
  });
  return ok(JSON.parse(JSON.stringify(result)) as ConnectionTestSnapshot);
}

/** Désigne le robot de l'officine. N'ouvre aucune connexion : l'intégration est en préparation. */
export async function saveRobotSetupAction(payload: RobotSetupInput): Promise<ActionResult<RobotSetup>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const result = await saveRobotSetup(session.scope, payload);
  if (!result.ok) return fail(result.error, result.fieldErrors);
  revalidatePath("/connexion");
  return ok(result.setup, "Robot enregistré. L'intégration est en préparation : rien n'est encore lu du robot.");
}

export async function clearRobotSetupAction(): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  await clearRobotSetup(session.scope);
  revalidatePath("/connexion");
  return ok(null, "Robot retiré.");
}

