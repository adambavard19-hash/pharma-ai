"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { createAssociation, deleteAssociation, updateAssociation } from "@/server/services/product-associations";
import { MAX_SENTENCE_LENGTH } from "@/core/associations/rules";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les associations de produits : un produit conseil en appelle un autre.
 *
 * Même permission que les règles de conseil de l'officine : c'est le pharmacien (ou le titulaire) qui décide quoi
 * associer à quoi. Le service ne laisse passer que les produits de l'officine du demandeur.
 */

const createSchema = z.object({
  /** Le déclencheur : un produit du stock… */
  triggerProductId: z.string().min(1).optional().nullable(),
  /** …ou un médicament du catalogue national (un médicament conseil comme Coryzalia). Un seul des deux. */
  triggerSpecialtyId: z.string().min(1).optional().nullable(),
  adviceProductId: z.string().min(1, "Choisissez le produit à conseiller."),
  sentence: z.string().max(MAX_SENTENCE_LENGTH + 200, "La phrase est trop longue.").optional().nullable(),
});

export async function createAssociationAction(payload: z.input<typeof createSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les produits choisis.", zodFieldErrors(parsed.error.issues));

  const result = await createAssociation(session.scope, parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/associations");
  return ok(null, `Association enregistrée : « ${result.adviceName} » sera proposé avec « ${result.triggerName} », dès la prochaine vente.`);
}

const updateSchema = z.object({
  associationId: z.string().min(1),
  sentence: z.string().max(MAX_SENTENCE_LENGTH + 200, "La phrase est trop longue.").optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function updateAssociationAction(payload: z.input<typeof updateSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return fail("Modification invalide.", zodFieldErrors(parsed.error.issues));

  const { associationId, ...changes } = parsed.data;
  const result = await updateAssociation(session.scope, associationId, changes);
  if (!result.ok) return fail(result.error);
  revalidatePath("/associations");
  return ok(null, changes.isActive === false ? "Association suspendue : elle ne sera plus proposée." : changes.isActive === true ? "Association réactivée." : "Phrase enregistrée.");
}

export async function deleteAssociationAction(associationId: string): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  if (!associationId) return fail("Association introuvable.");
  const result = await deleteAssociation(session.scope, associationId);
  if (!result.ok) return fail(result.error);
  revalidatePath("/associations");
  return ok(null, "Association supprimée.");
}
