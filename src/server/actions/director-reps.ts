"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDirectorSession, type DirectorSession } from "@/server/auth/director-session";
import { COMMISSION_MAX, COMMISSION_TYPES } from "@/core/sales/director/team";
import { createTeamMember, deleteTeamMember, REASSIGN_MAX, reassignProspects, resendTeamInvitation, setTeamMemberActive, updateTeamMember, type DirectorRef } from "@/server/services/sales/director-team";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les gestes du directeur commercial sur son équipe : ajouter, modifier,
 * désactiver, inviter, supprimer un commercial, réaffecter des dossiers.
 *
 * Chaque action commence par la session du directeur ; son identité vient de
 * là, jamais de la demande. Les services revérifient tout identifiant en base
 * et tracent chaque geste.
 */

const directorOf = (session: DirectorSession): DirectorRef => ({ id: session.director.id, label: session.director.fullName });

/** Les pages qui montrent l'équipe : l'espace du directeur, et la console qui lit la même table. */
function revalidateTeam(salesRepId?: string) {
  for (const path of ["/directeur", "/directeur/commerciaux", "/admin/commerciaux"]) revalidatePath(path);
  revalidatePath("/directeur/commerciaux/[id]", "page");
  if (salesRepId) revalidatePath(`/directeur/commerciaux/${salesRepId}`);
}

const id = z.string().trim().min(1, "Commercial introuvable.").max(64);
const optionalText = (max: number) => z.string().trim().max(max, `${max} caractères au plus.`).optional().nullable();

const commissionValue = z.number("Indiquez le montant de la commission.").int("Montant invalide.").min(0, "La commission ne peut pas être négative.");

function checkCommission(value: { commissionType?: (typeof COMMISSION_TYPES)[number]; commissionValue?: number }, ctx: z.RefinementCtx) {
  if (value.commissionType && value.commissionValue !== undefined && value.commissionValue > COMMISSION_MAX[value.commissionType]) {
    ctx.addIssue({ code: "custom", path: ["commissionValue"], message: value.commissionType === "PERCENT" ? "Un pourcentage ne dépasse pas 100 %." : "Ce montant est trop élevé : 100 000 € au plus." });
  }
}

const identity = {
  firstName: z.string().trim().min(1, "Indiquez le prénom.").max(80, "80 caractères au plus."),
  lastName: z.string().trim().min(1, "Indiquez le nom.").max(80, "80 caractères au plus."),
  phone: optionalText(30),
  zone: optionalText(120),
};

const createSchema = z
  .object({
    ...identity,
    email: z.string().trim().toLowerCase().pipe(z.email("Cette adresse e-mail n'est pas valide.")),
    commissionType: z.enum(COMMISSION_TYPES, "Choisissez le type de commission."),
    commissionValue,
    invite: z.boolean().optional(),
  })
  .superRefine(checkCommission);

type InvitationOutcome = { status: string; detail: string };

function invitationSentence(invitation: InvitationOutcome | null): string {
  if (invitation === null) return "Aucune invitation envoyée.";
  return invitation.status === "SENT" ? "Invitation envoyée." : `Invitation NON envoyée : ${invitation.detail}.`;
}

/** Ajoute un commercial et, si demandé, lui envoie l'invitation ; l'issue de l'envoi est dite telle quelle. */
export async function createRepAction(payload: z.input<typeof createSchema>): Promise<ActionResult<{ salesRepId: string; name: string; invitation: InvitationOutcome | null }>> {
  const session = await requireDirectorSession();
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const { invite, ...input } = parsed.data;

  const result = await createTeamMember(input, directorOf(session), { invite: invite !== false });
  if (!result.ok) return fail("Un commercial existe déjà avec cette adresse e-mail.", { email: "Cette adresse est déjà utilisée." });
  revalidateTeam();
  return ok({ salesRepId: result.id, name: result.name, invitation: result.invitation }, `${result.name} est ajouté(e). ${invitationSentence(result.invitation)}`);
}

const updateSchema = z
  .object({
    salesRepId: id,
    firstName: identity.firstName.optional(),
    lastName: identity.lastName.optional(),
    phone: identity.phone,
    zone: identity.zone,
    commissionType: z.enum(COMMISSION_TYPES).optional(),
    commissionValue: commissionValue.optional(),
  })
  .superRefine((value, ctx) => {
    // Le type et la valeur vont ensemble : une valeur sans son type n'a pas de sens.
    if ((value.commissionType === undefined) !== (value.commissionValue === undefined)) ctx.addIssue({ code: "custom", path: ["commissionValue"], message: "Indiquez le type et le montant de la commission." });
    checkCommission(value, ctx);
  });

/** Modifie l'identité (prénom, nom, téléphone, zone) et la commission. L'e-mail, qui est l'identifiant, ne change pas ici. */
export async function updateRepAction(payload: z.input<typeof updateSchema>): Promise<ActionResult<null>> {
  const session = await requireDirectorSession();
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const { salesRepId, ...patch } = parsed.data;

  const result = await updateTeamMember(salesRepId, patch, directorOf(session));
  if (!result.ok) return fail("Commercial introuvable.");
  revalidateTeam(salesRepId);
  return ok(null, patch.commissionType ? "Commercial mis à jour. La nouvelle commission vaut pour les prochains contrats." : "Commercial mis à jour.");
}

const activeSchema = z.object({ salesRepId: id, active: z.boolean() });

/** Désactive (réversible) ou réactive un commercial. */
export async function setRepActiveAction(payload: z.input<typeof activeSchema>): Promise<ActionResult<{ openProspects: number }>> {
  const session = await requireDirectorSession();
  const parsed = activeSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await setTeamMemberActive(parsed.data.salesRepId, parsed.data.active, directorOf(session));
  if (!result.ok) return fail("Commercial introuvable.");
  revalidateTeam(parsed.data.salesRepId);
  if (parsed.data.active) return ok({ openProspects: result.openProspects }, result.changed ? "Compte réactivé. Le commercial peut de nouveau se connecter." : "Ce compte était déjà actif.");
  const left = result.openProspects === 0 ? "" : result.openProspects === 1 ? " Son dossier ouvert reste à son nom : réaffectez-le." : ` Ses ${result.openProspects} dossiers ouverts restent à son nom : réaffectez-les.`;
  return ok({ openProspects: result.openProspects }, result.changed ? `Compte désactivé. Le commercial ne peut plus se connecter.${left}` : "Ce compte était déjà désactivé.");
}

const inviteSchema = z.object({ salesRepId: id });

/** Envoie ou renvoie l'invitation par e-mail. */
export async function inviteRepAction(payload: z.input<typeof inviteSchema>): Promise<ActionResult<null>> {
  const session = await requireDirectorSession();
  const parsed = inviteSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await resendTeamInvitation(parsed.data.salesRepId, directorOf(session));
  if (!result.ok) return fail(result.reason === "INACTIVE" ? "Ce compte est désactivé : réactivez-le avant d'envoyer une invitation." : "Commercial introuvable.");
  revalidateTeam(parsed.data.salesRepId);
  return result.invitation.status === "SENT" ? ok(null, "Invitation envoyée.") : fail(`Invitation NON envoyée : ${result.invitation.detail}.`);
}

/** Supprime définitivement un commercial, seulement s'il n'a aucun historique. */
export async function deleteRepAction(payload: z.input<typeof inviteSchema>): Promise<ActionResult<null>> {
  const session = await requireDirectorSession();
  const parsed = inviteSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await deleteTeamMember(parsed.data.salesRepId, directorOf(session));
  if (!result.ok) {
    revalidateTeam(parsed.data.salesRepId);
    return fail(result.reason === "HAS_HISTORY" ? result.message : "Commercial introuvable.");
  }
  revalidateTeam();
  return ok(null, "Commercial supprimé définitivement.");
}

const reassignSchema = z.object({
  prospectIds: z.array(z.string().trim().min(1).max(64)).min(1, "Choisissez au moins un dossier.").max(REASSIGN_MAX, `${REASSIGN_MAX} dossiers au plus à la fois.`),
  salesRepId: id,
});

/** Confie un ou plusieurs dossiers à un commercial actif (réaffectation, ou attribution d'un dossier sans commercial). */
export async function reassignProspectsAction(payload: z.input<typeof reassignSchema>): Promise<ActionResult<{ moved: number }>> {
  const session = await requireDirectorSession();
  const parsed = reassignSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Demande invalide.");

  const result = await reassignProspects(parsed.data.prospectIds, parsed.data.salesRepId, directorOf(session));
  if (!result.ok) {
    const messages = {
      REP_NOT_FOUND: "Ce commercial est introuvable.",
      REP_INACTIVE: "Ce commercial est désactivé : choisissez un commercial actif.",
      NOTHING_TO_MOVE: "Ces dossiers sont déjà à ce commercial, ou n'existent plus.",
    } as const;
    return fail(messages[result.reason]);
  }
  revalidateTeam();
  const skipped = result.alreadyHis + result.unknown;
  const note = skipped > 0 ? ` ${skipped} dossier${skipped > 1 ? "s" : ""} déjà à lui ou introuvable${skipped > 1 ? "s" : ""}, laissé${skipped > 1 ? "s" : ""} tel${skipped > 1 ? "s" : ""} quel${skipped > 1 ? "s" : ""}.` : "";
  return ok({ moved: result.moved }, `${result.moved} dossier${result.moved > 1 ? "s confiés" : " confié"} à ${result.repName}. Il est prévenu.${note}`);
}
