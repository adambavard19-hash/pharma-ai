"use server";

import { setWeeklyDigestSubscription, userFromUnsubscribeToken } from "@/server/services/weekly-digest";
import { fail, ok, type ActionResult } from "./types";

/** Depuis le lien du résumé, sans compte : se désinscrire, ou se réinscrire. Le lien signé désigne la personne. */
export async function weeklyDigestChoiceAction(_previous: ActionResult<{ subscribed: boolean }> | null, formData: FormData): Promise<ActionResult<{ subscribed: boolean }>> {
  const userId = userFromUnsubscribeToken(String(formData.get("token") ?? ""));
  if (!userId) return fail("Ce lien n'est plus valable. Le prochain résumé en contiendra un nouveau.");
  const subscribed = formData.get("choice") === "subscribe";
  if (!(await setWeeklyDigestSubscription(userId, subscribed))) return fail("Ce compte n'existe plus.");
  return ok({ subscribed }, subscribed ? "Vous recevrez de nouveau le résumé." : "Vous ne recevrez plus le résumé.");
}
