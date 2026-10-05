"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { MANUAL_LEAD_STATUSES, REFERRAL_LEAD_STATUS_LABELS, setReferralLeadStatus } from "@/server/services/referral-leads";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les confrères proposés au parrainage, sur la fiche d'un dossier de la console :
 * marquer « Contacté » ou « Décliné ». Le service relit le confrère en base, refuse
 * de toucher à un confrère déjà rapproché, et trace le geste (événement du dossier,
 * journal d'audit sans donnée personnelle). Rien n'est envoyé à la personne.
 */

const statusSchema = z.object({
  leadId: z.string().trim().min(1, "Confrère manquant.").max(64),
  status: z.enum(MANUAL_LEAD_STATUSES, { message: "Statut inconnu." }),
});

export async function setReferralLeadStatusAction(payload: z.input<typeof statusSchema>): Promise<ActionResult<{ status: string }>> {
  const session = await requirePlatformSession();
  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Requête invalide.", zodFieldErrors(parsed.error.issues));
  const result = await setReferralLeadStatus(parsed.data.leadId, parsed.data.status, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  revalidatePath(`/admin/dossiers/${result.referrerProspectId}`);
  return ok({ status: parsed.data.status }, result.changed ? `Confrère marqué « ${REFERRAL_LEAD_STATUS_LABELS[parsed.data.status]} ».` : `Déjà « ${REFERRAL_LEAD_STATUS_LABELS[parsed.data.status]} ».`);
}
