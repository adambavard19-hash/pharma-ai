"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { cookies } from "next/headers";
import { BLOOD_MAX_BYTES, adviseBloodTestAtCounter, adviseBloodTestForPatient, decideBloodRule } from "@/server/services/blood-test";
import { APP_SESSION_COOKIE, memberFromSession } from "@/server/services/app-members";
import { PATIENT_BLOOD_TEST_ENABLED } from "@/core/blood-test/rules";
import type { BloodProposal } from "@/core/blood-test/propose";
import type { BloodAnalysis } from "@/core/blood-test/reading";
import { fail, ok, type ActionResult } from "./types";

/** Au comptoir : le pharmacien dépose la prise de sang, PharmaBoost la lit et l'oublie aussitôt. */
export async function readBloodTestAction(formData: FormData): Promise<ActionResult<{ proposals: BloodProposal[]; analyses: BloodAnalysis[] }>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const file = formData.get("fichier");
  if (!(file instanceof File) || file.size === 0) return fail("Ajoutez une photo ou un PDF de la prise de sang.");
  if (file.size > BLOOD_MAX_BYTES) return fail("Le fichier dépasse 10 Mo.");
  const result = await adviseBloodTestAtCounter(session.scope, { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type });
  if (!result.ok) return fail(result.error);
  return ok({ proposals: result.proposals, analyses: result.analyses });
}

const DECISION_MESSAGES = {
  VALIDATE: (title: string) => `« ${title} » est validé : PharmaBoost peut le proposer, au comptoir et dans l'appli.`,
  REMOVE: (title: string) => `« ${title} » est supprimé : plus aucun produit n'est proposé pour cette valeur.`,
  RESTORE: (title: string) => `« ${title} » est de nouveau à relire.`,
} as const;

export async function decideBloodRuleAction(payload: { ruleKey: string; decision: "VALIDATE" | "REMOVE" | "RESTORE" }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ ruleKey: z.string().min(1).max(120), decision: z.enum(["VALIDATE", "REMOVE", "RESTORE"]) }).safeParse(payload);
  if (!parsed.success) return fail("Décision invalide.");
  const result = await decideBloodRule({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.ruleKey, parsed.data.decision);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, DECISION_MESSAGES[parsed.data.decision](result.title));
}

/** Appli des patients : l'inscrit dépose sa prise de sang ; rien n'est enregistré, ni l'image ni le résultat. */
export async function readBloodTestForPatientAction(formData: FormData): Promise<ActionResult<{ proposals: BloodProposal[]; analyses: BloodAnalysis[] }>> {
  if (!PATIENT_BLOOD_TEST_ENABLED) return fail("La lecture des prises de sang n'est pas disponible dans l'application pour le moment.");
  const member = await memberFromSession((await cookies()).get(APP_SESSION_COOKIE)?.value);
  if (!member) return fail("Connectez-vous pour faire lire votre prise de sang.");
  const file = formData.get("fichier");
  if (!(file instanceof File) || file.size === 0) return fail("Ajoutez une photo ou le PDF de votre prise de sang.");
  if (file.size > BLOOD_MAX_BYTES) return fail("Le fichier dépasse 10 Mo.");
  const result = await adviseBloodTestForPatient({ bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type });
  if (!result.ok) return fail(result.error);
  return ok({ proposals: result.proposals, analyses: result.analyses });
}
