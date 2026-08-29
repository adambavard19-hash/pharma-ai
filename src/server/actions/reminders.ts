"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import {
  cancelReminder,
  optOutByToken,
  scheduleReminder,
  sendReminder,
  snoozeReminder,
} from "@/server/services/followup";
import { findTemplate, proposedDueDate } from "@/core/followup";
import { isDemoMode } from "@/config/env";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les décisions du pharmacien sur les suivis.
 *
 * Aucune de ces actions n'est déclenchée par une minuterie : un suivi part
 * parce qu'un professionnel a cliqué, et l'action enregistre qui.
 */

const scheduleSchema = z.object({
  patientId: z.string().min(1),
  templateKey: z.string().min(1),
  /** Jours avant échéance ; sinon le délai par défaut du gabarit. */
  delayDays: z.coerce.number().int().min(0).max(365).optional(),
  treatmentDurationDays: z.coerce.number().int().min(0).max(365).optional(),
  saleId: z.string().optional().nullable(),
  prescriptionId: z.string().optional().nullable(),
  note: z.string().trim().max(300).optional(),
});

export async function scheduleReminderAction(
  payload: z.input<typeof scheduleSchema>,
): Promise<ActionResult<{ reminderId: string; dueAt: string }>> {
  const session = await requirePermission(PERMISSIONS.FOLLOWUP_SCHEDULE);
  const parsed = scheduleSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les informations du suivi.");

  const template = findTemplate(parsed.data.templateKey);
  if (!template) return fail("Type de suivi inconnu.");

  const now = new Date();
  const dueAt =
    parsed.data.delayDays === undefined
      ? proposedDueDate(template, now, parsed.data.treatmentDurationDays ?? null)
      : (() => {
          const date = new Date(now);
          date.setDate(date.getDate() + parsed.data.delayDays!);
          date.setHours(9, 0, 0, 0);
          return date;
        })();

  try {
    const { reminderId } = await scheduleReminder({
      scope: session.scope,
      patientId: parsed.data.patientId,
      templateKey: template.key,
      dueAt,
      saleId: parsed.data.saleId ?? null,
      prescriptionId: parsed.data.prescriptionId ?? null,
      note: parsed.data.note ?? null,
      isDemo: isDemoMode(),
    });

    revalidatePath("/suivis");
    revalidatePath("/");
    return ok(
      { reminderId, dueAt: dueAt.toISOString() },
      `Suivi programmé pour le ${dueAt.toLocaleDateString("fr-FR")}.`,
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Suivi non programmé.");
  }
}

export async function sendReminderAction(
  reminderId: string,
): Promise<ActionResult<{ simulated: boolean }>> {
  const session = await requirePermission(PERMISSIONS.FOLLOWUP_SEND);

  try {
    const result = await sendReminder({ scope: session.scope, reminderId });
    revalidatePath("/suivis");
    revalidatePath("/");

    // On ne prétend jamais avoir envoyé : tant qu'aucun fournisseur n'est
    // branché, le message n'a pas été transmis et le message le dit.
    return ok(
      { simulated: result.status !== "SENT" },
      result.status === "SENT"
        ? "Suivi envoyé au patient."
        : "Envoi SIMULÉ — aucun message n'a réellement été transmis.",
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Envoi impossible.");
  }
}

export async function snoozeReminderAction(
  reminderId: string,
  days = 7,
): Promise<ActionResult<{ dueAt: string }>> {
  const session = await requirePermission(PERMISSIONS.FOLLOWUP_SCHEDULE);

  try {
    const dueAt = await snoozeReminder({ scope: session.scope, reminderId, days });
    revalidatePath("/suivis");
    revalidatePath("/");
    return ok(
      { dueAt: dueAt.toISOString() },
      `Reporté au ${dueAt.toLocaleDateString("fr-FR")}.`,
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Report impossible.");
  }
}

export async function cancelReminderAction(
  reminderId: string,
  reason?: string,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.FOLLOWUP_SCHEDULE);

  try {
    await cancelReminder({ scope: session.scope, reminderId, reason: reason ?? null });
    revalidatePath("/suivis");
    revalidatePath("/");
    return ok(null, "Suivi annulé.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Annulation impossible.");
  }
}

/**
 * Désinscription confirmée par le patient, depuis le lien reçu.
 *
 * Aucune session : c'est le jeton, porté par le message, qui identifie le
 * patient. Il ne donne accès à rien d'autre — ni à la fiche, ni au dossier.
 */
export async function confirmOptOutAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return fail("Lien invalide.");

  const result = await optOutByToken(token);
  if (!result) return fail("Ce lien n'est plus valide. Contactez votre pharmacie.");

  revalidatePath("/suivis");
  return ok(null, "Désinscription enregistrée.");
}
