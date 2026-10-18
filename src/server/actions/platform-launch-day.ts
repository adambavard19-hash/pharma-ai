"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { sendLaunchDay, sendLaunchDayTrial } from "@/server/services/launch-day";
import { fail, ok, type ActionResult } from "./types";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choisissez la date du jour J.");

/** M'envoyer les deux versions de l'e-mail du jour J (titulaire, comptoir), avec le nom de cette pharmacie. */
export async function sendLaunchDayTrialAction(payload: { pharmacyId: string; day: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const day = DAY.safeParse(payload.day);
  if (!day.success) return fail(day.error.issues[0]?.message ?? "Date invalide.");
  const result = await sendLaunchDayTrial({ pharmacyId: payload.pharmacyId, day: day.data, to: session.admin.email, adminId: session.admin.id, adminFirstName: session.admin.fullName.split(" ")[0] || session.admin.fullName });
  if (result.sent === 0) return fail(`Essai non envoyé : ${result.failed.join(" · ")}`);
  return ok(null, `Essai envoyé à ${session.admin.email} : version titulaire et version comptoir.`);
}

/** L'e-mail du jour J à l'équipe cochée. */
export async function sendLaunchDayAction(payload: { pharmacyId: string; day: string; membershipIds: string[] }): Promise<ActionResult<{ sent: number }>> {
  const session = await requirePlatformSession();
  const day = DAY.safeParse(payload.day);
  if (!day.success) return fail(day.error.issues[0]?.message ?? "Date invalide.");
  if (payload.membershipIds.length === 0) return fail("Cochez au moins une personne.");
  try {
    const result = await sendLaunchDay({ pharmacyId: payload.pharmacyId, day: day.data, membershipIds: payload.membershipIds, adminId: session.admin.id });
    revalidatePath(`/admin/pharmacies/${payload.pharmacyId}`);
    if (result.sent === 0) return fail(`Rien n'est parti : ${result.failed.join(" · ")}`);
    return ok({ sent: result.sent }, `E-mail du jour J envoyé à ${result.sent} personne${result.sent > 1 ? "s" : ""} sur ${result.total}.${result.failed.length ? ` Échec : ${result.failed.join(" · ")}` : ""}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Envoi impossible.");
  }
}
