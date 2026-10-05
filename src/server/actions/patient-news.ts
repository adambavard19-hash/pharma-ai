"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { rateLimited } from "@/server/http/rate-limit";
import {
  confirmNewsOptIn,
  confirmNewsUnsubscribe,
  previewAnnouncement,
  resumeAnnouncement,
  sendAnnouncement,
  sendAnnouncementTest,
  setPatientNewsEnabled,
} from "@/server/services/patient-news";
import { validateAnnouncement, type AnnouncementValidation } from "@/core/patient-news";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les nouveautés pour les patients : les gestes du titulaire, puis ceux du
 * patient.
 *
 * Côté officine, `requirePermission` ouvre chaque action et l'officine vient
 * de la SESSION : aucun identifiant d'officine n'est lu dans la requête. Côté
 * patient, aucune session : le jeton du lien est la seule donnée acceptée, et
 * il ne donne accès à rien d'autre qu'à son propre abonnement.
 */

const announcementSchema = z.object({
  title: z.string().max(1000),
  rangeLabel: z.string().max(1000).nullable().optional(),
  message: z.string().max(5000),
});

/** La forme de la requête, puis les règles du domaine : l'écran les a déjà appliquées, le serveur les rejoue. */
function checkAnnouncement(payload: unknown): AnnouncementValidation {
  const shape = announcementSchema.safeParse(payload);
  if (!shape.success) return { ok: false, error: "Requête invalide." };
  return validateAnnouncement(shape.data);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

// ---------------------------------------------------------------- Officine

export async function previewAnnouncementAction(input: z.input<typeof announcementSchema>): Promise<ActionResult<{ subject: string; text: string; html: string }>> {
  const session = await requirePermission(PERMISSIONS.NEWS_MANAGE);
  const checked = checkAnnouncement(input);
  if (!checked.ok) return fail(checked.error);
  try {
    return ok(await previewAnnouncement(session.scope, checked.value));
  } catch (error) {
    console.error("[nouveautés] aperçu impossible", error);
    return fail("L'aperçu n'a pas pu être préparé.");
  }
}

export async function sendAnnouncementTestAction(input: z.input<typeof announcementSchema>): Promise<ActionResult<{ status: string; detail: string }>> {
  const session = await requirePermission(PERMISSIONS.NEWS_MANAGE);
  const checked = checkAnnouncement(input);
  if (!checked.ok) return fail(checked.error);
  const outcome = await sendAnnouncementTest({ ...session.scope, email: session.user.email }, checked.value);
  if (outcome.status === "FAILED") return fail(`Le message de test n'est pas parti : ${outcome.detail}`);
  if (outcome.status === "SIMULATED") return ok(outcome, "Envoi SIMULÉ : aucun service de messagerie n'est configuré, rien n'est parti.");
  return ok(outcome, "Message de test envoyé à votre adresse.");
}

const sendSchema = announcementSchema.extend({ confirmedRecipientCount: z.number().int().min(0).max(1_000_000) });

/**
 * L'envoi aux abonnés. Le titulaire confirme avec le nombre d'abonnés qu'il a
 * sous les yeux ; le service le recalcule et refuse s'il a changé. L'écran ne
 * dit « envoyé » que si des messages sont réellement partis.
 */
export async function sendAnnouncementAction(
  input: z.input<typeof sendSchema>,
): Promise<ActionResult<{ announcementId: string; recipientCount: number; sentCount: number; failedCount: number; simulated: boolean; complete: boolean }>> {
  const session = await requirePermission(PERMISSIONS.NEWS_MANAGE);
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return fail("Requête invalide.");
  const checked = validateAnnouncement(parsed.data);
  if (!checked.ok) return fail(checked.error);

  try {
    const result = await sendAnnouncement(session.scope, checked.value, parsed.data.confirmedRecipientCount);
    revalidatePath("/nouveautes");
    if (!result.ok) return fail(result.error);
    const data = { announcementId: result.announcementId, recipientCount: result.recipientCount, sentCount: result.sentCount, failedCount: result.failedCount, simulated: result.simulated, complete: result.complete };
    if (data.simulated) return ok(data, "Envoi SIMULÉ : aucun service de messagerie n'est configuré, aucun message n'est parti.");
    if (!data.complete) return ok(data, "Envoi en cours : une partie des abonnés est servie, le reste suit. Vous pouvez reprendre l'envoi depuis la liste.");
    if (data.sentCount === 0) return fail("Aucun message n'est parti : la messagerie a refusé tous les envois. Réessayez dans quelques instants.");
    return ok(data, data.failedCount > 0 ? `Annonce envoyée à ${plural(data.sentCount, "abonné")} ; ${plural(data.failedCount, "message")} n'ont pas pu être remis.` : `Annonce envoyée à ${plural(data.sentCount, "abonné")}.`);
  } catch (error) {
    console.error("[nouveautés] envoi impossible", error);
    return fail("L'annonce n'a pas pu être envoyée. Vérifiez son état dans la liste avant de réessayer.");
  }
}

export async function resumeAnnouncementAction(announcementId: string): Promise<ActionResult<{ sentCount: number; failedCount: number; complete: boolean }>> {
  const session = await requirePermission(PERMISSIONS.NEWS_MANAGE);
  const parsed = z.string().min(1).max(100).safeParse(announcementId);
  if (!parsed.success) return fail("Requête invalide.");

  try {
    const result = await resumeAnnouncement(session.scope, parsed.data);
    revalidatePath("/nouveautes");
    if (!result.ok) return fail(result.error);
    const data = { sentCount: result.sentCount, failedCount: result.failedCount, complete: result.complete };
    return ok(data, data.complete ? "Envoi terminé." : "Envoi repris : une partie des abonnés reste à servir.");
  } catch (error) {
    console.error("[nouveautés] reprise impossible", error);
    return fail("L'envoi n'a pas pu être repris.");
  }
}

export async function setPatientNewsEnabledAction(enabled: boolean): Promise<ActionResult<{ enabled: boolean }>> {
  const session = await requirePermission(PERMISSIONS.NEWS_MANAGE);
  const parsed = z.boolean().safeParse(enabled);
  if (!parsed.success) return fail("Requête invalide.");

  await setPatientNewsEnabled(session.scope, parsed.data);
  revalidatePath("/nouveautes");
  return ok({ enabled: parsed.data }, parsed.data ? "Le lien d'abonnement figure de nouveau dans les e-mails du plan." : "Le lien d'abonnement ne figure plus dans les e-mails du plan, et aucune annonce ne peut partir.");
}

// ---------------------------------------------------------------- Patient (aucune session)

const PUBLIC_ATTEMPTS_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;

/** Une limite par adresse IP : une page publique ne doit pas servir à essayer des jetons en rafale. */
async function throttled(kind: string): Promise<boolean> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  return rateLimited(`news-${kind}:${ip}`, PUBLIC_ATTEMPTS_PER_HOUR, HOUR_MS);
}

/**
 * L'abonnement, confirmé par le patient depuis le lien de l'e-mail du plan.
 * C'est son geste : tant qu'il n'a pas eu lieu, rien n'est conservé.
 */
export async function confirmNewsOptInAction(_previous: unknown, formData: FormData): Promise<ActionResult<{ pharmacyName: string }> | null> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token || token.length > 2000) return fail("Lien invalide.");
  if (await throttled("optin")) return fail("Trop de tentatives : réessayez dans une heure.");

  const result = await confirmNewsOptIn(token);
  if (!result.ok) return fail(result.error);
  return ok({ pharmacyName: result.pharmacyName }, "Votre accord est enregistré.");
}

/** La désinscription, confirmée par le patient depuis le lien présent dans chaque message. */
export async function confirmNewsUnsubscribeAction(_previous: unknown, formData: FormData): Promise<ActionResult<{ pharmacyName: string }> | null> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token || token.length > 2000) return fail("Lien invalide.");
  if (await throttled("unsubscribe")) return fail("Trop de tentatives : réessayez dans une heure.");

  const result = await confirmNewsUnsubscribe(token);
  if (!result.ok) return fail(result.error);
  return ok({ pharmacyName: result.pharmacyName }, "Désinscription enregistrée.");
}
