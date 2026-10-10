"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { answerCounterQuestion } from "@/server/services/counter-questions";
import { fail, ok, type ActionResult } from "./types";

/**
 * Répondre, depuis l'écran de la vente, à l'arbre de questions du comptoir (« pourquoi le patient prend-il son paracétamol ? »,
 * « où a-t-il mal ? »). C'est le même geste que dans la fenêtre du poste de caisse : même arbre, mêmes réponses, même état.
 */
const schema = z.object({ prescriptionId: z.string().min(1), node: z.string().min(1).max(60), choice: z.string().min(1).max(60) });

export async function answerCounterQuestionAction(payload: z.input<typeof schema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_DECIDE);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail("Réponse invalide.");
  const result = await answerCounterQuestion({ pharmacyId: session.scope.pharmacyId, userId: session.scope.userId, source: "ECRAN", ...parsed.data });
  if (!result.ok) return fail(result.error);
  revalidatePath(`/vente/${parsed.data.prescriptionId}`);
  return ok(null);
}
