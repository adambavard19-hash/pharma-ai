"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { setRuleDecision } from "@/server/services/advice-rule-reviews";
import { fail, ok, type ActionResult } from "./types";

/**
 * La relecture des règles de conseil : c'est le pharmacien (ou le titulaire) qui décide, pour son officine, quelles règles
 * peuvent parler au comptoir. Même permission que les autres règles de conseil de l'officine.
 */
const schema = z.object({
  ruleKey: z.string().min(1).max(120),
  /** `null` : remettre la règle « à relire ». */
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
      ? `« ${result.title} » validée : elle peut parler au comptoir.`
      : parsed.data.decision === "REJECTED"
        ? `« ${result.title} » refusée : elle ne sera plus proposée.`
        : `« ${result.title} » remise à relire.`,
  );
}
