"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { changeInvitationEmail, inviteOwnerByEmail, issueInvitationLink, sendInvitation } from "@/server/services/onboarding";
import { changeOwnerLoginEmail, changePharmacyContactEmail, resendOwnerAccess } from "@/server/services/pharmacy-admin";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les gestes de la console sur l'inscription d'une officine : inviter un
 * titulaire par e-mail, renvoyer ou corriger l'invitation, modifier les
 * adresses de l'officine, renvoyer l'accès. Réservés à l'éditeur.
 */

async function adminActor() {
  const session = await requirePlatformSession();
  return { type: "ADMIN" as const, id: session.admin.id, label: session.admin.fullName };
}

const SEND_MESSAGES: Record<string, (email: string, detail: string) => string> = {
  SENT: (email) => `Invitation envoyée à ${email}.`,
  SKIPPED: (_email, detail) => detail,
  SIMULATED: (_email, detail) => `Invitation non envoyée : ${detail}`,
  FAILED: (_email, detail) => `Invitation non envoyée : ${detail}`,
};

export async function inviteOwnerAction(payload: { email: string }): Promise<ActionResult<{ prospectId: string; sent: boolean }>> {
  const actor = await adminActor();
  const parsed = z.object({ email: z.string().trim().min(3) }).safeParse(payload);
  if (!parsed.success) return fail("Adresse e-mail requise.", { email: "Adresse e-mail requise." });
  const result = await inviteOwnerByEmail(parsed.data.email, actor);
  if (!result.ok) return fail(result.error, { email: result.error });
  revalidatePath("/admin/pharmacies");
  const message = (result.reused ? "Un dossier existait déjà pour cette adresse : il est repris. " : "") + SEND_MESSAGES[result.send.status](result.send.email, result.send.detail);
  // Le dossier existe même si l'envoi échoue : la console l'affiche « Échec d'envoi », renvoi possible.
  return ok({ prospectId: result.prospectId, sent: result.send.status === "SENT" }, message);
}

export async function resendInvitationAction(payload: { prospectId: string }): Promise<ActionResult<null>> {
  const actor = await adminActor();
  const send = await sendInvitation(payload.prospectId, actor);
  revalidatePath(`/admin/dossiers/${payload.prospectId}`);
  revalidatePath("/admin/pharmacies");
  if (send.status === "SENT" || send.status === "SKIPPED") return ok(null, SEND_MESSAGES[send.status](send.email, send.detail));
  return fail(SEND_MESSAGES[send.status](send.email, send.detail));
}

export async function copyInvitationLinkAction(payload: { prospectId: string }): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  const actor = await adminActor();
  const result = await issueInvitationLink(payload.prospectId, actor);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/admin/dossiers/${payload.prospectId}`);
  return ok({ url: result.url, expiresAt: result.expiresAt.toISOString() }, "Nouveau lien créé : l'ancien ne fonctionne plus.");
}

export async function changeInvitationEmailAction(payload: { prospectId: string; email: string; resend: boolean }): Promise<ActionResult<null>> {
  const actor = await adminActor();
  const changed = await changeInvitationEmail(payload.prospectId, payload.email, actor);
  if (!changed.ok) return fail(changed.error, { email: changed.error });
  let message = `Adresse corrigée : ${changed.to}.`;
  if (payload.resend) {
    const send = await sendInvitation(payload.prospectId, actor);
    message += ` ${SEND_MESSAGES[send.status](send.email, send.detail)}`;
  }
  revalidatePath(`/admin/dossiers/${payload.prospectId}`);
  revalidatePath("/admin/pharmacies");
  return ok(null, message);
}

const emailSchema = z.object({ pharmacyId: z.string().min(1), target: z.enum(["contact", "login"]), email: z.string().trim(), resend: z.boolean().default(true) });

/** « Modifier l'e-mail » : l'administrateur choisit explicitement ce qu'il modifie. */
export async function changePharmacyEmailAction(payload: z.input<typeof emailSchema>): Promise<ActionResult<null>> {
  const actor = await adminActor();
  const parsed = emailSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");
  const { pharmacyId, target, email, resend } = parsed.data;
  if (target === "contact") {
    const result = await changePharmacyContactEmail(pharmacyId, email, actor);
    if (!result.ok) return fail(result.error, { email: result.error });
    revalidatePath(`/admin/pharmacies/${pharmacyId}`);
    return ok(null, `E-mail de contact : ${result.to ?? "retiré"}.`);
  }
  const result = await changeOwnerLoginEmail(pharmacyId, email, actor, { resend });
  if (!result.ok) return fail(result.error, { email: result.error });
  revalidatePath(`/admin/pharmacies/${pharmacyId}`);
  const sent = result.resent ? (result.resent.status === "SENT" ? ` Accès envoyé à ${result.to}.` : ` Accès non envoyé : ${result.resent.detail}`) : "";
  return ok(null, `Identifiant du titulaire : ${result.from} → ${result.to}.${result.dossierUpdated ? " Le dossier suit." : ""}${sent}`);
}

export async function resendOwnerAccessAction(payload: { pharmacyId: string }): Promise<ActionResult<null>> {
  const actor = await adminActor();
  const result = await resendOwnerAccess(payload.pharmacyId, actor);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/admin/pharmacies/${payload.pharmacyId}`);
  if (result.status === "SENT") return ok(null, `${result.kind === "welcome" ? "E-mail de bienvenue" : "Lien d'accès"} envoyé à ${result.email}.`);
  if (result.status === "SKIPPED") return ok(null, result.detail);
  return fail(`Non envoyé : ${result.detail}`);
}
