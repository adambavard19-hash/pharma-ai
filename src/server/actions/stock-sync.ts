"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { createPairing, disconnectAgent, isLgoId, updateConnectionSettings } from "@/server/services/stock-sync";
import { fail, ok, type ActionResult } from "./types";

/** Réservé au titulaire (import de stock) : appairer, régler, révoquer l'agent. */

export async function createPairingAction(payload: { lgo: string }): Promise<ActionResult<{ code: string; expiresAt: string }>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  if (!isLgoId(payload.lgo)) return fail("Logiciel inconnu.");
  const pairing = await createPairing(session.scope, payload.lgo);
  revalidatePath("/stock/connexion");
  return ok({ code: pairing.code, expiresAt: pairing.expiresAt.toISOString() }, "Code d'appairage généré. Il est valable une heure.");
}

const settingsSchema = z.object({
  intervalSeconds: z.coerce.number().int().min(60).max(3600),
  exportPath: z.string().trim().max(500).optional().or(z.literal("")),
  scansPath: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function updateConnectionSettingsAction(payload: z.input<typeof settingsSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const parsed = settingsSchema.safeParse(payload);
  if (!parsed.success) return fail("Réglages invalides (intervalle entre 1 et 60 minutes).");
  await updateConnectionSettings(session.scope, {
    intervalSeconds: parsed.data.intervalSeconds,
    exportPath: parsed.data.exportPath || null,
    scansPath: parsed.data.scansPath || null,
  });
  revalidatePath("/stock/connexion");
  return ok(null, "Réglages enregistrés. L'agent les applique à son prochain signe de vie.");
}

export async function disconnectAgentAction(): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  await disconnectAgent(session.scope);
  revalidatePath("/stock/connexion");
  revalidatePath("/stock");
  return ok(null, "Agent déconnecté : sa clé est révoquée.");
}
