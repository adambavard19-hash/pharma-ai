"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { setRuleDecision } from "@/server/services/advice-rule-reviews";
import { fail, ok, type ActionResult } from "./types";

/**
 * La relecture facultative des règles de conseil : le pharmacien (ou le titulaire) peut refuser une règle pour son officine
 * ou noter qu'il la cautionne. Sans rien décider, toutes les règles du moteur fonctionnent. Même permission que les autres
 * règles de conseil de l'officine.
 */
const schema = z.object({
  ruleKey: z.string().min(1).max(120),
  /** `null` : effacer la décision (la règle redevient « pas relue » : elle fonctionne). */
  decision: z.enum(["VALIDATED", "REJECTED"]).nullable(),
});

export async function reviewAdviceRuleAction(payload: z.input<typeof schema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail("Décision invalide.");
  const result = await setRuleDecision(session.scope, parsed.data.ruleKey, parsed.data.decision);
  if (!result.ok) return fail(result.error);
  revalidatePath("/parametres/regles");
  return ok(
    null,
    parsed.data.decision === "VALIDATED"
      ? `« ${result.title} » validée : votre accord est noté.`
      : parsed.data.decision === "REJECTED"
        ? `« ${result.title} » refusée : elle ne sera plus proposée dans votre officine.`
        : `« ${result.title} » : décision annulée, la règle fonctionne comme pour toutes les officines.`,
  );
}
