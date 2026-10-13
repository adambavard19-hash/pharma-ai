"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { addCentralAssociation, addCustomRule, decideCentralAssociation, decideRule, editCentralAssociation, editRule, revertCentralAssociation, revertRule } from "@/server/services/central-advice";
import { previewMedicineAdvice, resolveMedicineSearch, type AdvicePreview, type MedicineSearch } from "@/server/services/advice-hub";
import { fail, ok, type ActionResult } from "./types";

/**
 * Le centre de contrôle des conseils, dans l'espace administrateur de PharmaBoost.
 *
 * Tout ce qui se décide ici vaut pour TOUTES les officines — existantes et à venir — dès la vente suivante. Seule une session
 * d'administrateur plateforme y accède : une officine ne peut ni valider, ni supprimer, ni ajouter un conseil commun.
 */

const decisionSchema = z.enum(["VALIDATE", "REMOVE", "RESTORE"]);

const DECISION_MESSAGES = {
  VALIDATE: (title: string) => `« ${title} » est validé : votre accord est noté, pour toutes les pharmacies.`,
  REMOVE: (title: string) => `« ${title} » est supprimé : il n'existe plus dans PharmaBoost, pour toutes les pharmacies.`,
  RESTORE: (title: string) => `« ${title} » est rétabli : il est de nouveau en ligne, à relire.`,
} as const;

export async function decideCentralRuleAction(payload: { ruleKey: string; decision: z.input<typeof decisionSchema> }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ ruleKey: z.string().min(1).max(120), decision: decisionSchema }).safeParse(payload);
  if (!parsed.success) return fail("Décision invalide.");
  const result = await decideRule({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.ruleKey, parsed.data.decision);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, DECISION_MESSAGES[parsed.data.decision](result.title));
}

export async function addCentralRuleAction(payload: unknown): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const result = await addCustomRule({ id: session.admin.id, fullName: session.admin.fullName }, payload);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, `« ${result.definition.title} » est en ligne dans toutes les pharmacies. Il reste « à relire » jusqu'à votre validation.`);
}

const associationSchema = z.object({
  trigger: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("MEDICINE"), name: z.string().trim().min(2).max(200) }),
    z.object({ kind: z.literal("PRODUCT"), ean: z.string().trim().min(7).max(20), name: z.string().trim().min(1).max(200) }),
  ]),
  advice: z.object({ ean: z.string().trim().min(7).max(20), name: z.string().trim().min(1).max(200) }),
  sentence: z.string().max(600).nullable().optional(),
});

export async function addCentralAssociationAction(payload: z.input<typeof associationSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = associationSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le déclencheur et le produit conseillé.");
  const result = await addCentralAssociation({ id: session.admin.id, fullName: session.admin.fullName }, { ...parsed.data, sentence: parsed.data.sentence ?? null });
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, "Association en ligne dans toutes les pharmacies qui ont le produit conseillé en stock. Elle reste « à relire » jusqu'à votre validation.");
}

export async function decideCentralAssociationAction(payload: { id: string; decision: z.input<typeof decisionSchema> }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ id: z.string().min(1).max(64), decision: decisionSchema }).safeParse(payload);
  if (!parsed.success) return fail("Décision invalide.");
  const result = await decideCentralAssociation({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id, parsed.data.decision);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, DECISION_MESSAGES[parsed.data.decision](result.label));
}

// ---------------------------------------------------------------------------------------------------------------
// Modifier, revenir à l'origine
// ---------------------------------------------------------------------------------------------------------------

export async function editCentralRuleAction(payload: { ruleKey: string; values: unknown }): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ ruleKey: z.string().min(1).max(120), values: z.record(z.string(), z.unknown()) }).safeParse(payload);
  if (!parsed.success) return fail("Modification invalide.");
  const result = await editRule({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.ruleKey, parsed.data.values);
  if (!result.ok) return result.needsConfirmation ? { ok: true, data: { needsConfirmation: true }, message: result.error } : fail(result.error);
  revalidatePath("/admin/conseils");
  return ok({ needsConfirmation: false }, `« ${result.title} » est modifié pour toutes les pharmacies. ${result.message}`);
}

export async function revertCentralRuleAction(payload: { ruleKey: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ ruleKey: z.string().min(1).max(120) }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await revertRule({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.ruleKey);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, `« ${result.title} » est revenu à sa version d'origine, pour toutes les pharmacies. Il est « à relire ».`);
}

const associationEditSchema = z.object({ id: z.string().min(1).max(64), advice: z.object({ ean: z.string().trim().min(7).max(20), name: z.string().trim().min(1).max(200) }), sentence: z.string().max(600).nullable() });

export async function editCentralAssociationAction(payload: z.input<typeof associationEditSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = associationEditSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le produit proposé et la phrase.");
  const result = await editCentralAssociation({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id, { advice: parsed.data.advice, sentence: parsed.data.sentence });
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, `« ${result.label} » est modifié pour toutes les pharmacies. Il repasse « à relire ».`);
}

export async function revertCentralAssociationAction(payload: { id: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await revertCentralAssociation({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, `« ${result.label} » est revenu à sa version d'origine. Il est « à relire ».`);
}

// ---------------------------------------------------------------------------------------------------------------
// Partir d'un médicament
// ---------------------------------------------------------------------------------------------------------------

export async function searchMedicinesAction(payload: { query: string }): Promise<ActionResult<MedicineSearch>> {
  await requirePlatformSession();
  const parsed = z.object({ query: z.string().max(120) }).safeParse(payload);
  if (!parsed.success) return fail("Recherche invalide.");
  return ok(await resolveMedicineSearch(parsed.data.query));
}

export async function previewMedicineAdviceAction(payload: { pharmacyId: string; specialtyId: string }): Promise<ActionResult<AdvicePreview>> {
  await requirePlatformSession();
  const parsed = z.object({ pharmacyId: z.string().min(1).max(64), specialtyId: z.string().min(1).max(64) }).safeParse(payload);
  if (!parsed.success) return fail("Choisissez une pharmacie.");
  const result = await previewMedicineAdvice(parsed.data.pharmacyId, parsed.data.specialtyId);
  return result.ok ? ok(result.preview) : fail(result.error);
}
