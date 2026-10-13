"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { createAssociationGrid, deleteAssociation, updateAssociation } from "@/server/services/product-associations";
import { MAX_ADVICE_PER_SAVE, MAX_SENTENCE_LENGTH, MAX_TRIGGERS_PER_SAVE } from "@/core/associations/rules";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les associations de produits : un produit conseil en appelle un autre.
 *
 * ASSOCIATIONS_MANAGE : le titulaire, le pharmacien et le préparateur (consigne du fondateur du 13 oct. 2026 : l'onglet
 * est ouvert à l'équipe, c'est un acte de conseil). Permission distincte des règles de conseil de l'officine, qui
 * restent fermées à l'équipe. Le service ne laisse passer que les produits de l'officine du demandeur.
 */

const quoted = (names: string[]): string => {
  const list = names.map((name) => `« ${name} »`);
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} et ${list[list.length - 1]}`;
};

const refSchema = z.object({ kind: z.enum(["PRODUCT", "DRUG"]), id: z.string().min(1) });

const gridSchema = z.object({
  /** Les déclencheurs : des produits du stock et/ou des médicaments (du stock ou du catalogue national). */
  triggers: z.array(refSchema).min(1, "Choisissez au moins un produit ou un médicament déclencheur.").max(MAX_TRIGGERS_PER_SAVE, `${MAX_TRIGGERS_PER_SAVE} déclencheurs au plus en une fois.`),
  /** Les produits proposés, dans l'ordre choisi : des produits de l'officine et/ou des médicaments sans ordonnance de son stock. */
  advice: z.array(refSchema).min(1, "Choisissez au moins un produit à conseiller.").max(MAX_ADVICE_PER_SAVE, `${MAX_ADVICE_PER_SAVE} produits au plus en une fois.`),
  sentence: z.string().max(MAX_SENTENCE_LENGTH + 200, "La phrase est trop longue.").optional().nullable(),
});

export type BatchSaveResult = { created: number; skipped: { name: string | null; trigger: string | null; reason: string }[] };

/**
 * Plusieurs déclencheurs × plusieurs produits proposés, en un clic : toutes les combinaisons sont créées. Ce qui ne peut pas
 * l'être (déjà associé, sur ordonnance, hors stock…) est dit, sans empêcher le reste : « 4 associations enregistrées », puis
 * la raison de chaque combinaison écartée.
 */
export async function createAssociationsAction(payload: z.input<typeof gridSchema>): Promise<ActionResult<BatchSaveResult>> {
  const session = await requirePermission(PERMISSIONS.ASSOCIATIONS_MANAGE);
  const parsed = gridSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les produits choisis.", zodFieldErrors(parsed.error.issues));

  const saved = await createAssociationGrid(session.scope, parsed.data);
  if (!saved.ok) return fail(saved.error);
  const { created, skipped: dropped } = saved.result;
  const skipped = dropped.map((skip) => ({ name: skip.adviceName, trigger: skip.triggerName, reason: skip.reason }));
  if (created.length === 0) return fail(skipped.map((skip) => skip.reason).join(" ") || "Aucune association enregistrée.");
  revalidatePath("/associations");
  const count = created.length;
  const triggers = [...new Set(created.map((row) => row.triggerName))];
  const advice = [...new Set(created.map((row) => row.adviceName))];
  const message =
    triggers.length > 1
      ? `${count} associations enregistrées : ${triggers.length} déclencheurs × ${advice.length} produit${advice.length > 1 ? "s" : ""} proposé${advice.length > 1 ? "s" : ""}, dès la prochaine vente.`
      : `${count === 1 ? "1 association enregistrée" : `${count} associations enregistrées`} : ${quoted(advice)} ${advice.length === 1 ? "sera proposé" : "seront proposés"} avec ${quoted(triggers)}, dès la prochaine vente.`;
  return ok({ created: count, skipped }, message);
}

const updateSchema = z.object({
  associationId: z.string().min(1),
  sentence: z.string().max(MAX_SENTENCE_LENGTH + 200, "La phrase est trop longue.").optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function updateAssociationAction(payload: z.input<typeof updateSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.ASSOCIATIONS_MANAGE);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return fail("Modification invalide.", zodFieldErrors(parsed.error.issues));

  const { associationId, ...changes } = parsed.data;
  const result = await updateAssociation(session.scope, associationId, changes);
  if (!result.ok) return fail(result.error);
  revalidatePath("/associations");
  return ok(null, changes.isActive === false ? "Association suspendue : elle ne sera plus proposée." : changes.isActive === true ? "Association réactivée." : "Phrase enregistrée.");
}

export async function deleteAssociationAction(associationId: string): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.ASSOCIATIONS_MANAGE);
  if (!associationId) return fail("Association introuvable.");
  const result = await deleteAssociation(session.scope, associationId);
  if (!result.ok) return fail(result.error);
  revalidatePath("/associations");
  return ok(null, "Association supprimée.");
}
