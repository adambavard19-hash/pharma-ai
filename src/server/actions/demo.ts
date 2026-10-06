"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { isCommercialDemoPharmacy } from "@/core/demo/identity";
import { findDemoScenario } from "@/core/demo/scenarios";
import { installDemoPharmacy } from "@/server/services/demo/provision";
import { simulateScan } from "@/server/services/demo/simulate";
import { recordAudit } from "@/server/audit/log";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les deux gestes de l'officine de démonstration : simuler une délivrance et
 * tout remettre à zéro.
 *
 * Ils n'existent que pour cette officine : toute autre session reçoit un refus
 * avant la moindre lecture. L'officine vient TOUJOURS de la session, jamais du
 * formulaire.
 */

const NOT_DEMO = "Ce geste n'existe que dans l'officine de démonstration.";

const stepSchema = z.object({ scenarioId: z.string().min(1).max(60), step: z.number().int().min(0).max(40) });

export type DemoScanData = { prescriptionId: string; drugName: string; step: number; total: number; done: boolean };

/** Un bip du scénario (l'écran en enchaîne quelques-uns, à quelques secondes d'écart). */
export async function simulateDeliveryStepAction(payload: z.input<typeof stepSchema>): Promise<ActionResult<DemoScanData>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  if (!isCommercialDemoPharmacy(session.pharmacy)) return fail(NOT_DEMO);
  const parsed = stepSchema.safeParse(payload);
  if (!parsed.success || !findDemoScenario(parsed.data.scenarioId)) return fail("Scénario inconnu.");

  const result = await simulateScan({ scope: session.scope, scenarioId: parsed.data.scenarioId, step: parsed.data.step });
  if (!result.ok) return fail(result.error);
  if (parsed.data.step === 0) {
    await recordAudit({ action: "demo.delivery_simulated", entityType: "Pharmacy", entityId: session.scope.pharmacyId, pharmacyId: session.scope.pharmacyId, userId: session.scope.userId, metadata: { scenario: parsed.data.scenarioId } });
  }
  revalidatePath("/vente/nouvelle");
  return ok({ prescriptionId: result.prescriptionId, drugName: result.drugName, step: result.step, total: result.total, done: result.done });
}

/** « Réinitialiser la démo » : l'officine retrouve son état initial, historique rafraîchi à la date du jour. */
export async function resetDemoAction(): Promise<ActionResult<{ sales: number; recommendations: number }>> {
  const session = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  if (!isCommercialDemoPharmacy(session.pharmacy)) return fail(NOT_DEMO);
  try {
    const result = await installDemoPharmacy({});
    await recordAudit({ action: "demo.reset", entityType: "Pharmacy", entityId: session.scope.pharmacyId, pharmacyId: session.scope.pharmacyId, userId: session.scope.userId });
    revalidatePath("/", "layout");
    return ok({ sales: result.counts.sales, recommendations: result.counts.recommendations }, "La démonstration est remise à l'état initial.");
  } catch (error) {
    console.error("[démo] réinitialisation impossible", error instanceof Error ? error.message : error);
    return fail("La réinitialisation n'a pas abouti. Réessayez dans un instant.");
  }
}
