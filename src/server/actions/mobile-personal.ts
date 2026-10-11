"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserSession } from "@/server/auth/user-session";
import { recordAudit } from "@/server/audit/log";
import { archiveObjective, createObjective, decideBonus, proposeBonus } from "@/server/services/mobile/personal";
import { dismissTrainingSuggestion } from "@/server/services/mobile/coach";
import { validateObjective } from "@/core/personal/objectives";
import { isBonusDecision, parseEuros, validateBonusLabel } from "@/core/personal/bonuses";
import { calendarDay } from "@/core/challenges/dates";
import { fail, ok, type ActionResult } from "./types";

/**
 * Challenges, objectifs, primes et coach de PharmaBoost Mobile.
 *
 * Chaque action relit la session : la portée (officine ACTIVE + personne connectée) vient d'elle, jamais du formulaire.
 * Les gestes d'équipe (objectifs des autres, primes) sont revérifiés EN BASE par le service : titulaire de CETTE
 * officine, collaborateur de CETTE officine. Chaque décision est tracée dans le journal d'audit (identifiants et
 * montants, aucune donnée de santé).
 */

async function teamScope() {
  const session = await getUserSession();
  if (!session?.scope) return null;
  return session.scope;
}

function revalidateMobile() {
  revalidatePath("/m/challenges", "layout");
  revalidatePath("/m/moi");
  revalidatePath("/m");
}

export async function createObjectiveAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const scope = await teamScope();
  if (!scope) return fail("Votre session a expiré : reconnectez-vous.");
  const text = (name: string) => String(formData.get(name) ?? "");
  const validated = validateObjective(
    {
      userId: text("userId"),
      title: text("title"),
      metric: text("metric"),
      target: Number(text("target")),
      period: text("period"),
      startsOn: text("startsOn") || null,
      endsOn: text("endsOn") || null,
      challengeId: text("challengeId") || null,
    },
    calendarDay(new Date()),
  );
  if (!validated.ok) return fail("Vérifiez l'objectif.", validated.fieldErrors);
  const result = await createObjective(scope, validated.value);
  if (!result.ok) return fail(result.error, result.fieldErrors);
  await recordAudit({
    action: "objective.created",
    entityType: "PersonalObjective",
    entityId: result.data.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { collaboratorId: validated.value.userId, metric: validated.value.metric, target: validated.value.target, startsOn: validated.value.startsOn, endsOn: validated.value.endsOn },
  });
  revalidateMobile();
  return ok(null, "Objectif fixé : votre collaborateur le voit dans son application.");
}

export async function archiveObjectiveAction(payload: { id: string }): Promise<ActionResult<null>> {
  const scope = await teamScope();
  if (!scope) return fail("Votre session a expiré : reconnectez-vous.");
  const parsed = z.object({ id: z.string().min(1).max(60) }).safeParse(payload);
  if (!parsed.success) return fail("Objectif inconnu.");
  const result = await archiveObjective(scope, parsed.data.id);
  if (!result.ok) return fail(result.error);
  await recordAudit({ action: "objective.archived", entityType: "PersonalObjective", entityId: parsed.data.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { collaboratorId: result.data.userId } });
  revalidateMobile();
  return ok(null, "Objectif retiré.");
}

export async function proposeBonusAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const scope = await teamScope();
  if (!scope) return fail("Votre session a expiré : reconnectez-vous.");
  const userId = String(formData.get("userId") ?? "");
  const label = validateBonusLabel(String(formData.get("label") ?? ""));
  const amountCents = parseEuros(String(formData.get("amount") ?? ""));
  const fieldErrors: Record<string, string> = {};
  if (!userId) fieldErrors.userId = "Choisissez le collaborateur.";
  if (!label) fieldErrors.label = "Un motif de 3 à 80 caractères.";
  if (amountCents === null) fieldErrors.amount = "Un montant en euros, de 0,01 à 5 000.";
  if (Object.keys(fieldErrors).length > 0) return fail("Vérifiez la prime.", fieldErrors);
  const link = String(formData.get("link") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  const result = await proposeBonus(scope, {
    userId,
    label: label!,
    amountCents: amountCents!,
    objectiveId: link.startsWith("objective:") ? link.slice(10) : null,
    challengeId: link.startsWith("challenge:") ? link.slice(10) : null,
    note,
  });
  if (!result.ok) return fail(result.error, result.fieldErrors);
  await recordAudit({ action: "bonus.proposed", entityType: "BonusAuthorization", entityId: result.data.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { collaboratorId: userId, amountCents } });
  revalidateMobile();
  return ok(null, "Prime proposée. Elle reste invisible pour votre collaborateur tant que vous ne l'avez pas validée.");
}

const DECISION_AUDIT = { VALIDATE: "bonus.validated", PAY: "bonus.paid", CANCEL: "bonus.cancelled" } as const;
const DECISION_MESSAGE = {
  VALIDATE: "Prime validée : votre collaborateur la voit maintenant dans « Mes primes ».",
  PAY: "Prime marquée versée.",
  CANCEL: "Prime annulée.",
} as const;

export async function decideBonusAction(payload: { id: string; decision: string }): Promise<ActionResult<null>> {
  const scope = await teamScope();
  if (!scope) return fail("Votre session a expiré : reconnectez-vous.");
  if (typeof payload?.id !== "string" || payload.id.length > 60 || !isBonusDecision(payload.decision)) return fail("Geste inconnu.");
  const result = await decideBonus(scope, payload.id, payload.decision);
  if (!result.ok) return fail(result.error);
  await recordAudit({
    action: DECISION_AUDIT[payload.decision],
    entityType: "BonusAuthorization",
    entityId: payload.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { collaboratorId: result.data.userId, amountCents: result.data.amountCents, from: result.data.previous, to: result.data.status },
  });
  revalidateMobile();
  return ok(null, DECISION_MESSAGE[payload.decision]);
}

export async function dismissSuggestionAction(payload: { id: string }): Promise<ActionResult<null>> {
  const session = await getUserSession();
  if (!session) return fail("Votre session a expiré : reconnectez-vous.");
  if (typeof payload?.id !== "string" || payload.id.length > 60) return fail("Suggestion inconnue.");
  const done = await dismissTrainingSuggestion(session.user.id, payload.id);
  if (!done) return fail("Cette suggestion n'est plus là.");
  await recordAudit({ action: "coach.suggestion_dismissed", entityType: "TrainingRecommendation", entityId: payload.id, userId: session.user.id, pharmacyId: session.activePharmacy?.id ?? null });
  revalidatePath("/m/moi");
  return ok(null, "Suggestion écartée pour 30 jours.");
}
