"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { SalesDirectorError, createSalesDirector, deleteSalesDirector, resendDirectorInvitation, setSalesDirectorActive, updateSalesDirector } from "@/server/services/sales/directors";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Le directeur commercial, côté console Super Admin : l'ajouter (l'invitation
 * part toute seule), corriger son identité, renvoyer l'invitation, le
 * désactiver ou le supprimer. Chaque geste part d'une session administrateur
 * (première ligne de chaque action) ; l'administrateur vient de la session,
 * jamais de la demande. Le service trace chaque geste dans l'audit.
 */

const PAGE = "/admin/directeur-commercial";

const id = z.string().trim().min(1, "Directeur introuvable.").max(64);
const identity = {
  firstName: z.string().trim().min(1, "Indiquez le prénom.").max(80, "80 caractères au plus."),
  lastName: z.string().trim().min(1, "Indiquez le nom.").max(80, "80 caractères au plus."),
  email: z.string().trim().toLowerCase().min(1, "Indiquez l'adresse e-mail.").email("Adresse e-mail invalide.").max(160, "160 caractères au plus."),
  phone: z.string().trim().max(30, "30 caractères au plus.").optional().nullable(),
};

/** Un refus métier du service se rend en clair ; toute autre erreur remonte. */
function refusal(error: unknown): ActionResult<never> {
  if (error instanceof SalesDirectorError) return fail(error.message);
  throw error;
}

const notSent = (detail: string) => `Invitation NON envoyée : ${detail.trim().replace(/[.\s]+$/, "")}.`;

/** L'issue de l'envoi, en une phrase honnête : « envoyée » seulement si l'e-mail est parti. */
function invitationSentence(invitation: { status: string; detail: string }, email: string): string {
  return invitation.status === "SENT" ? `Invitation envoyée à ${email}.` : notSent(invitation.detail);
}

const createSchema = z.object(identity);

export async function createSalesDirectorAction(payload: z.input<typeof createSchema>): Promise<ActionResult<{ salesDirectorId: string; email: string; invitation: { status: string; detail: string } }>> {
  const session = await requirePlatformSession();
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  try {
    const created = await createSalesDirector(parsed.data, session.admin.id);
    revalidatePath(PAGE);
    return ok({ salesDirectorId: created.id, email: parsed.data.email, invitation: created.invitation }, `${parsed.data.firstName} ${parsed.data.lastName} est ajouté(e) comme directeur commercial. ${invitationSentence(created.invitation, parsed.data.email)}`);
  } catch (error) {
    return refusal(error);
  }
}

const updateSchema = z.object({ salesDirectorId: id, firstName: identity.firstName.optional(), lastName: identity.lastName.optional(), email: identity.email.optional(), phone: identity.phone });

export async function updateSalesDirectorAction(payload: z.input<typeof updateSchema>): Promise<ActionResult<{ emailChanged: boolean }>> {
  const session = await requirePlatformSession();
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const { salesDirectorId, ...input } = parsed.data;
  try {
    const result = await updateSalesDirector(salesDirectorId, input, session.admin.id);
    revalidatePath(PAGE);
    return ok(result, result.emailChanged ? "Adresse modifiée. Renvoyez l'invitation : le lien précédent ne fonctionne plus." : "Directeur mis à jour.");
  } catch (error) {
    return refusal(error);
  }
}

const activeSchema = z.object({ salesDirectorId: id, isActive: z.boolean() });

export async function setSalesDirectorActiveAction(payload: z.input<typeof activeSchema>): Promise<ActionResult<{ changed: boolean }>> {
  const session = await requirePlatformSession();
  const parsed = activeSchema.safeParse(payload);
  if (!parsed.success) return fail("Directeur introuvable.");
  try {
    const result = await setSalesDirectorActive(parsed.data.salesDirectorId, parsed.data.isActive, session.admin.id);
    revalidatePath(PAGE);
    if (!result.changed) return ok(result, parsed.data.isActive ? "Ce compte était déjà actif : rien n'a changé." : "Ce compte était déjà désactivé : rien n'a changé.");
    return ok(result, parsed.data.isActive ? "Compte réactivé." : "Compte désactivé : ses sessions sont fermées.");
  } catch (error) {
    return refusal(error);
  }
}

const idSchema = z.object({ salesDirectorId: id });

export async function resendDirectorInvitationAction(payload: z.input<typeof idSchema>): Promise<ActionResult<{ invitation: { status: string; detail: string } }>> {
  const session = await requirePlatformSession();
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Directeur introuvable.");
  try {
    const invitation = await resendDirectorInvitation(parsed.data.salesDirectorId, session.admin.id);
    revalidatePath(PAGE);
    // Un échec d'envoi n'est pas un succès : le lien existe, mais l'e-mail n'est pas parti.
    return invitation.status === "SENT" ? ok({ invitation }, "Invitation renvoyée.") : fail(notSent(invitation.detail));
  } catch (error) {
    return refusal(error);
  }
}

export async function deleteSalesDirectorAction(payload: z.input<typeof idSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Directeur introuvable.");
  try {
    await deleteSalesDirector(parsed.data.salesDirectorId, session.admin.id);
    revalidatePath(PAGE);
    return ok(null, "Directeur commercial supprimé. Il ne peut plus se connecter.");
  } catch (error) {
    return refusal(error);
  }
}
