"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDirectorSession, type DirectorSession } from "@/server/auth/director-session";
import { createChallenge, deleteChallenge, endChallenge, updateChallenge, type ChallengeActor } from "@/server/services/sales/challenges";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les gestes du directeur commercial sur les challenges : lancer, modifier,
 * terminer, supprimer.
 *
 * Chaque action commence par la session du directeur ; son identité vient de
 * là, jamais de la demande. Ici on ne vérifie que la FORME de la demande : les
 * règles (objectif, dates, ce qui ne se modifie plus) sont celles du cœur,
 * rappelées par le service, qui trace chaque geste.
 */

const actorOf = (session: DirectorSession): ChallengeActor => ({ type: "DIRECTOR", id: session.director.id, label: session.director.fullName });

/** Les pages qui montrent les challenges : la liste, la fiche, le tableau de bord, l'extranet des commerciaux. */
function revalidateChallenges(id?: string) {
  for (const path of ["/directeur", "/directeur/challenges", "/extranet/challenges"]) revalidatePath(path);
  if (id) revalidatePath(`/directeur/challenges/${id}`);
}

const id = z.string().trim().min(1).max(64);
const text = (max: number) => z.string().max(max).optional();

/** La forme du formulaire : des textes. Les bornes de ce schéma ne servent qu'à refuser une demande démesurée. */
const formSchema = z.object({
  title: z.string().max(300),
  description: text(2000),
  metric: z.string().max(40),
  target: z.union([z.string().max(12), z.number()]),
  startsDay: z.string().max(10),
  endsDay: z.string().max(10),
  rewardLabel: text(400),
  rewardEuros: z.union([z.string().max(14), z.number()]).optional(),
});

export type ChallengePayload = z.input<typeof formSchema>;

const updateSchema = formSchema.extend({ id });
const idSchema = z.object({ id });

export async function createChallengeAction(payload: ChallengePayload): Promise<ActionResult<{ id: string }>> {
  const session = await requireDirectorSession();
  const parsed = formSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await createChallenge(parsed.data, actorOf(session));
  if (!result.ok) return fail(result.error, result.fieldErrors);

  revalidateChallenges(result.id);
  const people = result.notified === 0 && result.notifyFailed === 0 ? "Aucun commercial actif à prévenir pour l'instant." : (result.notified > 1 ? `${result.notified} commerciaux ont été prévenus.` : "1 commercial a été prévenu.");
  const trouble = result.notifyFailed > 0 ? ` ${result.notifyFailed} notification${result.notifyFailed > 1 ? "s n'ont" : " n'a"} pas pu partir.` : "";
  return ok({ id: result.id }, `Challenge lancé. ${people}${trouble}`);
}

export async function updateChallengeAction(payload: z.input<typeof updateSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requireDirectorSession();
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const { id: challengeId, ...form } = parsed.data;
  const result = await updateChallenge(challengeId, form, actorOf(session));
  if (!result.ok) return fail(result.error, result.fieldErrors);

  revalidateChallenges(challengeId);
  return ok({ id: challengeId }, result.changed.length === 0 ? "Rien n'a changé." : "Challenge enregistré.");
}

export async function endChallengeAction(payload: z.input<typeof idSchema>): Promise<ActionResult<null>> {
  const session = await requireDirectorSession();
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await endChallenge(parsed.data.id, actorOf(session));
  if (!result.ok) return fail(result.error);

  revalidateChallenges(parsed.data.id);
  return ok(null, `« ${result.title} » est terminé. Les résultats sont figés.`);
}

export async function deleteChallengeAction(payload: z.input<typeof idSchema>): Promise<ActionResult<null>> {
  const session = await requireDirectorSession();
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await deleteChallenge(parsed.data.id, actorOf(session));
  if (!result.ok) return fail(result.error);

  revalidateChallenges(parsed.data.id);
  return ok(null, `« ${result.title} » est supprimé.`);
}
