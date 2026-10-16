"use server";

import { unsubscribeFromCureReminders } from "@/server/services/cure-reminders";
import { fail, ok, type ActionResult } from "./types";

/** Depuis le lien d'un rappel de fin de cure, sans compte : ne plus en recevoir. Le lien signé désigne l'adresse (par son empreinte). */
export async function cureUnsubscribeAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const done = await unsubscribeFromCureReminders(String(formData.get("token") ?? ""));
  return done ? ok(null, "Vous ne recevrez plus de rappels de fin de cure.") : fail("Ce lien n'est plus valable.");
}
