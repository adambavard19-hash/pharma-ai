"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { addCentralAssociation, addCustomRule, decideCentralAssociation, decideRule, editCentralAssociation, editRule, revertCentralAssociation, revertRule } from "@/server/services/central-advice";
import { previewMedicineAdvice, resolveMedicineSearch, type AdvicePreview, type MedicineSearch } from "@/server/services/advice-hub";
import { createTriggerFamily, previewFamilyTerms, setTriggerFamilyMember, setTriggerFamilyRemoved, updateTriggerFamily, type FamilyProduct } from "@/server/services/trigger-families";
import { saveFamilyRanking } from "@/server/services/advice-priorities";
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
    z.object({ kind: z.literal("FAMILY"), familyId: z.string().trim().min(1).max(40) }),
    z.object({ kind: z.literal("ATC"), code: z.string().trim().min(3).max(10), label: z.string().trim().max(120).nullable() }),
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

// ---------------------------------------------------------------------------------------------------------------
// Les familles déclencheuses
// ---------------------------------------------------------------------------------------------------------------

const familyDraftSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(600).nullable().optional(),
  includeTerms: z.array(z.string().max(200)).max(80),
  excludeTerms: z.array(z.string().max(200)).max(80),
});

export async function saveTriggerFamilyAction(payload: { id?: string | null } & z.input<typeof familyDraftSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = familyDraftSchema.extend({ id: z.string().max(40).nullable().optional() }).safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le nom et les mots de la famille.");
  const admin = { id: session.admin.id, fullName: session.admin.fullName };
  const draft = { ...parsed.data, description: parsed.data.description ?? null };
  const result = parsed.data.id ? await updateTriggerFamily(admin, parsed.data.id, draft).then((r) => (r.ok ? { ok: true as const, id: parsed.data.id as string } : r)) : await createTriggerFamily(admin, draft);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok({ id: result.id }, parsed.data.id ? "Famille enregistrée, pour toutes les pharmacies." : "Famille créée. Vous pouvez maintenant vous en servir comme déclencheur.");
}

export async function previewTriggerFamilyAction(payload: { includeTerms: string[]; excludeTerms: string[] }): Promise<ActionResult<FamilyProduct[]>> {
  await requirePlatformSession();
  const parsed = familyDraftSchema.pick({ includeTerms: true, excludeTerms: true }).safeParse(payload);
  if (!parsed.success) return fail("Mots invalides.");
  return ok(await previewFamilyTerms(parsed.data.includeTerms, parsed.data.excludeTerms));
}

export async function setTriggerFamilyMemberAction(payload: { familyId: string; ean: string; label: string; included: boolean | null }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ familyId: z.string().min(1).max(40), ean: z.string().min(7).max(20), label: z.string().max(200), included: z.boolean().nullable() }).safeParse(payload);
  if (!parsed.success) return fail("Produit invalide.");
  const result = await setTriggerFamilyMember({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.familyId, { ean: parsed.data.ean, label: parsed.data.label }, parsed.data.included);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, parsed.data.included === false ? "Produit retiré de la famille." : parsed.data.included ? "Produit ajouté à la famille." : "Choix annulé.");
}

export async function setTriggerFamilyRemovedAction(payload: { id: string; removed: boolean }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ id: z.string().min(1).max(40), removed: z.boolean() }).safeParse(payload);
  if (!parsed.success) return fail("Famille invalide.");
  const result = await setTriggerFamilyRemoved({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id, parsed.data.removed);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, parsed.data.removed ? `« ${result.name} » est supprimée : ses associations ne se déclenchent plus.` : `« ${result.name} » est rétablie.`);
}

export async function saveAdvicePrioritiesAction(payload: { code: string; ruleKeys: string[] }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ code: z.string().trim().min(1).max(10), ruleKeys: z.array(z.string().min(1).max(120)).max(50) }).safeParse(payload);
  if (!parsed.success) return fail("Classement invalide.");
  const result = await saveFamilyRanking({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.code, parsed.data.ruleKeys);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils/priorites");
  return ok(null, parsed.data.ruleKeys.length === 0 ? `${result.label} : retour à l'ordre de PharmaBoost.` : `${result.label} : votre ordre est enregistré, pour toutes les pharmacies, dès la prochaine vente.`);
}
