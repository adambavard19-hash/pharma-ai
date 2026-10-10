"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { createSession, getRequestMeta } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { throttled } from "@/server/security/throttle";
import { recordAudit } from "@/server/audit/log";
import { claimComptoir, releaseComptoir } from "@/server/services/comptoirs";
import { acceptInvitation, approveJoinRequest, inviteCollaborators, refuseJoinRequest, requestToJoin, resendInvitation, revokeInvitation, searchPharmacies, type InviteOutcome, type PublicPharmacy } from "@/server/services/team-access";
import { parseEmails } from "@/core/team/access";
import { refuseInDemo } from "./demo-guard";
import { fail, ok, type ActionResult } from "./types";

/**
 * Entrer dans une officine. Côté titulaire : inviter, renvoyer, annuler, approuver, refuser — toujours dans l'officine de SA session.
 * Côté public : chercher sa pharmacie, demander à la rejoindre, ouvrir son lien d'invitation — freinés, et sans jamais dire si une adresse
 * e-mail a déjà un compte.
 */

const STATUS_WORDS: Record<InviteOutcome["status"], string> = {
  SENT: "invitation envoyée",
  SIMULATED: "invitation préparée (l'envoi d'e-mails est en mode test)",
  FAILED: "l'e-mail n'a pas pu partir",
  ALREADY_MEMBER: "fait déjà partie de l'équipe",
  UNAVAILABLE: "adresse indisponible",
};

const inviteSchema = z.object({ emails: z.string().max(4000), role: z.string().max(20), firstName: z.string().trim().max(80).optional(), lastName: z.string().trim().max(80).optional() });

export async function inviteCollaboratorsAction(payload: z.input<typeof inviteSchema>): Promise<ActionResult<{ results: InviteOutcome[] }>> {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const refused = refuseInDemo(session, "Mode démo : aucune invitation n'est envoyée.");
  if (refused) return refused;
  const parsed = inviteSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const { valid, invalid } = parseEmails(parsed.data.emails);
  if (invalid.length > 0) return fail(`Adresse e-mail invalide : ${invalid.slice(0, 3).join(", ")}.`);
  const result = await inviteCollaborators(session.scope, { emails: valid, role: parsed.data.role, firstName: parsed.data.firstName, lastName: parsed.data.lastName });
  if (!result.ok) return fail(result.error);
  revalidatePath("/equipe");
  const sent = result.results.filter((entry) => entry.status === "SENT" || entry.status === "SIMULATED").length;
  const problems = result.results.filter((entry) => entry.status !== "SENT" && entry.status !== "SIMULATED");
  const message = problems.length === 0 ? (sent > 1 ? `${sent} invitations envoyées.` : "Invitation envoyée.") : [sent > 0 ? `${sent} invitation${sent > 1 ? "s" : ""} envoyée${sent > 1 ? "s" : ""}.` : "", ...problems.map((entry) => `${entry.email} : ${STATUS_WORDS[entry.status]}.`)].filter(Boolean).join(" ");
  if (sent === 0) return fail(message);
  return ok({ results: result.results }, message);
}

const idSchema = z.object({ id: z.string().min(1).max(64) });

export async function resendInvitationAction(payload: { id: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const refused = refuseInDemo(session, "Mode démo : aucune invitation n'est envoyée.");
  if (refused) return refused;
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await resendInvitation(session.scope, parsed.data.id);
  if (!result.ok) return fail(result.error);
  revalidatePath("/equipe");
  return result.status === "FAILED" ? fail(`L'e-mail pour ${result.email} n'a pas pu partir.`) : ok(null, `Invitation renvoyée à ${result.email}.`);
}

export async function revokeInvitationAction(payload: { id: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await revokeInvitation(session.scope, parsed.data.id);
  if (!result.ok) return fail(result.error);
  revalidatePath("/equipe");
  return ok(null, `Invitation à ${result.email} annulée : son lien ne marche plus.`);
}

export async function approveJoinRequestAction(payload: { id: string; role: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const refused = refuseInDemo(session, "Mode démo : les comptes de la démonstration ne changent pas.");
  if (refused) return refused;
  const parsed = idSchema.extend({ role: z.string().max(20) }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await approveJoinRequest(session.scope, parsed.data.id, parsed.data.role);
  if (!result.ok) return fail(result.error);
  revalidatePath("/equipe");
  return ok(null, `${result.name} fait maintenant partie de l'équipe. Un e-mail l'en prévient.`);
}

export async function refuseJoinRequestAction(payload: { id: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.TEAM_MANAGE);
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await refuseJoinRequest(session.scope, parsed.data.id);
  if (!result.ok) return fail(result.error);
  revalidatePath("/equipe");
  return ok(null, `Demande de ${result.name} refusée.`);
}

/** « Je travaille ici » : tout membre de l'équipe qui prend les ventes, ouvre cette action ; elle ne touche jamais qu'à SON attribution. */
export async function claimComptoirAction(payload: { postId: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const parsed = z.object({ postId: z.string().min(1).max(64) }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await claimComptoir(session.scope, parsed.data.postId);
  if (!result.ok) return fail(result.error);
  revalidatePath("/vente/nouvelle");
  revalidatePath("/connexion");
  return ok(null, result.changed ? `Vous travaillez à « ${result.name} » : vos conseils et vos ventes y sont attribués.` : `Vous étiez déjà à « ${result.name} ».`);
}

export async function releaseComptoirAction(payload: { postId: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const parsed = z.object({ postId: z.string().min(1).max(64) }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await releaseComptoir(session.scope, parsed.data.postId);
  if (!result.ok) return fail(result.error);
  revalidatePath("/vente/nouvelle");
  revalidatePath("/connexion");
  return ok(null, `« ${result.name} » est libre.`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Côté public : aucune session, des freins.
// ---------------------------------------------------------------------------------------------------------------------------------

async function clientKey(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
}

export async function searchPharmaciesAction(query: string): Promise<ActionResult<{ pharmacies: PublicPharmacy[] }>> {
  if (typeof query !== "string" || query.length > 200) return ok({ pharmacies: [] });
  if (throttled(`join-search:${await clientKey()}`, 20)) return fail("Trop de recherches : patientez une minute.");
  return ok({ pharmacies: await searchPharmacies(query) });
}

const joinSchema = z.object({
  pharmacyId: z.string().min(1).max(64),
  firstName: z.string().max(80),
  lastName: z.string().max(80),
  email: z.string().max(200),
  password: z.string().max(200),
  role: z.string().max(20),
});

export async function requestToJoinAction(payload: z.input<typeof joinSchema>): Promise<ActionResult<{ pharmacyName: string }>> {
  const parsed = joinSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les informations saisies.");
  const key = await clientKey();
  if (throttled(`join-request:${key}`, 4, 10 * 60_000) || throttled(`join-request-mail:${parsed.data.email.trim().toLowerCase()}`, 2, 10 * 60_000)) return fail("Trop de tentatives : patientez quelques minutes.");
  const result = await requestToJoin(parsed.data);
  if (!result.ok) return fail(result.error);
  return ok({ pharmacyName: result.pharmacyName });
}

const acceptSchema = z.object({ firstName: z.string().max(80), lastName: z.string().max(80), password: z.string().max(200) });

/** Ouvre le compte depuis le lien d'invitation, puis connecte la personne : elle arrive directement dans la bonne officine. */
export async function acceptInvitationAction(token: string, payload: z.input<typeof acceptSchema>): Promise<ActionResult<never>> {
  if (typeof token !== "string" || token.length > 200) return fail("Ce lien n'est plus valable.");
  const parsed = acceptSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les informations saisies.");
  if (throttled(`invitation:${await clientKey()}`, 8)) return fail("Trop de tentatives : patientez une minute.");
  const result = await acceptInvitation(token, parsed.data);
  if (!result.ok) return fail(result.error);
  const meta = await getRequestMeta();
  await createSession({ userId: result.userId, pharmacyId: result.pharmacyId, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
  await recordAudit({ action: "auth.login", entityType: "User", entityId: result.userId, pharmacyId: result.pharmacyId, userId: result.userId, metadata: { via: "invitation" } });
  redirect("/");
}
