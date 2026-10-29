"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ADVICE_MODULES } from "@/core/ai/advice-modules";
import { saveAdviceModules } from "@/server/services/advice-modules";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les modules de conseil (fondateur, 29 oct. 2026) : le titulaire choisit les siens pour SA pharmacie (celle de la session,
 * jamais un identifiant reçu) ; l'équipe PharmaBoost peut régler ceux de n'importe quelle pharmacie depuis la console.
 */

const codesSchema = z.array(z.enum(ADVICE_MODULES.map((item) => item.code) as [string, ...string[]])).max(ADVICE_MODULES.length);

const message = (count: number) => (count === 0 ? "Aucun module : PharmaBoost choisit le meilleur produit, sans orientation." : "Vos modules sont enregistrés : ils passent devant dès la prochaine vente.");

export async function saveMyAdviceModulesAction(payload: { modules: string[] }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const parsed = codesSchema.safeParse(payload?.modules);
  if (!parsed.success) return fail("Choix de modules invalide.");
  const result = await saveAdviceModules(session.scope.pharmacyId, parsed.data, { userId: session.scope.userId });
  if (!result.ok) return fail(result.error);
  revalidatePath("/parametres/laboratoires/modules");
  return ok(null, message(result.modules.length));
}

export async function savePharmacyModulesAction(payload: { pharmacyId: string; modules: string[] }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ pharmacyId: z.string().min(1).max(64), modules: codesSchema }).safeParse(payload);
  if (!parsed.success) return fail("Choix de modules invalide.");
  const result = await saveAdviceModules(parsed.data.pharmacyId, parsed.data.modules, { platformAdminId: session.admin.id });
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils/modules");
  return ok(null, "Modules enregistrés pour cette pharmacie, dès la prochaine vente.");
}
