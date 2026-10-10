"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { assignComptoir, renameComptoir } from "@/server/services/comptoirs";
import { fail, ok, type ActionResult } from "./types";

/**
 * Qui travaille à quel comptoir, et comment il s'appelle. Réservé au titulaire ; la pharmacie est celle de la session, jamais celle
 * d'une adresse : un comptoir d'une autre pharmacie est « introuvable ».
 */

const postSchema = z.object({ postId: z.string().min(1).max(64) });

export async function assignComptoirAction(payload: { postId: string; userId: string | null }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const parsed = postSchema.extend({ userId: z.string().min(1).max(64).nullable() }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await assignComptoir(session.scope, parsed.data.postId, parsed.data.userId);
  if (!result.ok) return fail(result.error);
  revalidatePath("/connexion");
  revalidatePath("/vente/nouvelle");
  return ok(null, result.assignee ? `${result.name} est maintenant le comptoir de ${result.assignee}.` : `${result.name} n'est plus attribué.`);
}

export async function renameComptoirAction(payload: { postId: string; name: string }): Promise<ActionResult<{ name: string }>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const parsed = postSchema.extend({ name: z.string().max(200) }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await renameComptoir(session.scope, parsed.data.postId, parsed.data.name);
  if (!result.ok) return fail(result.error);
  revalidatePath("/connexion");
  return ok({ name: result.name }, `Comptoir renommé : ${result.name}.`);
}
