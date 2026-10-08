"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { addCentralAssociation, addCustomRule, decideCentralAssociation, decideRule } from "@/server/services/central-advice";
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
