"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { CLINICAL_DECISIONS, decideClinicalFlags } from "@/server/services/mobile/coach";
import { fail, ok, type ActionResult } from "@/server/actions/types";

const schema = z.object({ ruleKey: z.string().min(1).max(160), decision: z.enum(CLINICAL_DECISIONS), note: z.string().trim().max(500).optional() });

const MESSAGES = {
  UNDER_REVIEW: "Noté : la règle est en cours de relecture.",
  CONFIRMED_OK: "Règle confirmée : les signalements sont clos.",
  RULE_CHANGED: "Règle modifiée : les signalements sont clos. Les refus à venir ouvriront un nouveau signalement.",
  DISMISSED: "Signalements écartés.",
} as const;

/** La décision de la validation clinique centrale sur une règle signalée. Administrateurs PharmaBoost seulement. */
export async function decideClinicalFlagAction(payload: { ruleKey: string; decision: string; note?: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail("Décision invalide.");
  const count = await decideClinicalFlags({ id: session.admin.id }, parsed.data.ruleKey, parsed.data.decision, parsed.data.note || null);
  if (count === 0) return fail("Plus aucun signalement ouvert pour cette règle.");
  await recordAudit({ action: "clinical_flag.decided", entityType: "ClinicalReviewFlag", entityId: parsed.data.ruleKey, platformAdminId: session.admin.id, metadata: { decision: parsed.data.decision, flags: count } });
  revalidatePath("/admin/validation-clinique");
  return ok(null, MESSAGES[parsed.data.decision]);
}
