"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { createAssociations, deleteAssociation, updateAssociation } from "@/server/services/product-associations";
import { MAX_ADVICE_PER_SAVE, MAX_SENTENCE_LENGTH } from "@/core/associations/rules";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les associations de produits : un produit conseil en appelle un autre.
 *
 * Même permission que les règles de conseil de l'officine : c'est le pharmacien (ou le titulaire) qui décide quoi
 * associer à quoi. Le service ne laisse passer que les produits de l'officine du demandeur.
 */

const batchSchema = z.object({
  /** Le déclencheur : un produit du stock… */
  triggerProductId: z.string().min(1).optional().nullable(),
  /** …ou un médicament (du stock ou du catalogue national — Coryzalia, la cétirizine). Un seul des deux. */
  triggerSpecialtyId: z.string().min(1).optional().nullable(),
  /** Les produits conseillés, dans l'ordre où le pharmacien les a choisis. */
  adviceProductIds: z.array(z.string().min(1)).min(1, "Choisissez au moins un produit à conseiller.").max(MAX_ADVICE_PER_SAVE, `${MAX_ADVICE_PER_SAVE} produits au plus en une fois.`),
  sentence: z.string().max(MAX_SENTENCE_LENGTH + 200, "La phrase est trop longue.").optional().nullable(),
});

const quoted = (names: string[]): string => {
  const list = names.map((name) => `« ${name} »`);
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} et ${list[list.length - 1]}`;
};

export type BatchSaveResult = { created: number; skipped: { name: string | null; reason: string }[] };

/**
 * Plusieurs produits conseillés d'un coup pour un même déclencheur. Ce qui ne peut pas être créé (déjà associé, désactivé…)
 * est dit, sans empêcher le reste : « 2 associations enregistrées », puis la raison de chaque produit écarté.
 */
export async function createAssociationsAction(payload: z.input<typeof batchSchema>): Promise<ActionResult<BatchSaveResult>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const parsed = batchSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les produits choisis.", zodFieldErrors(parsed.error.issues));

  const result = await createAssociations(session.scope, parsed.data);
  if (!result.ok) return fail(result.error);
  const skipped = result.skipped.map((skip) => ({ name: skip.adviceName, reason: skip.reason }));
  if (result.created.length === 0) return fail(skipped.map((skip) => skip.reason).join(" ") || "Aucune association enregistrée.");
  revalidatePath("/associations");
  const count = result.created.length;
  const names = quoted(result.created.map((row) => row.adviceName));
  return ok(
    { created: count, skipped },
    `${count === 1 ? "1 association enregistrée" : `${count} associations enregistrées`} : ${names} ${count === 1 ? "sera proposé" : "seront proposés"} avec « ${result.triggerName} », dès la prochaine vente.`,
  );
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
