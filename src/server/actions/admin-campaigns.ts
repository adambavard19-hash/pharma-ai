"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import {
  cancelCampaign,
  createCampaign,
  deleteDraftCampaign,
  previewAudience,
  previewCampaignEmail,
  resumeCampaign,
  scheduleCampaign,
  sendCampaignTest,
  startCampaign,
  unscheduleCampaign,
  updateCampaign,
} from "@/server/services/admin/campaigns";
import { AUDIENCE_KEYS, CAMPAIGN_CONFIRMATION_WORD, describeSchedule, isCampaignConfirmation, validateCampaignDraft, type AudienceKey } from "@/core/admin/campaigns";
import { isCalendarDay, zonedDayStart } from "@/core/challenges/dates";
import { TIME_ZONE } from "@/config/constants";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les gestes des campagnes de la console. Session administrateur exigée à
 * chaque appel ; chaque changement d'état va au journal d'audit avec l'avant
 * et l'après (dans les services appelés). Ici, seulement la forme des
 * entrées : les règles (montants, variables, public) sont celles du domaine.
 *
 * Rien ne part sans un envoi confirmé : le mot « ENVOYER » retapé, et le
 * nombre de destinataires affiché, que le serveur recalcule et compare.
 */

const ids = z.array(z.string().max(60)).max(2100);
const id = z.string().min(1).max(60);

/** La forme d'un brouillon, rien de plus : les montants, les variables et le public sont contrôlés par le domaine. */
const draftShape = z.object({
  kind: z.string().max(40),
  name: z.string().max(400),
  subject: z.string().max(600),
  title: z.string().max(600),
  body: z.string().max(12000),
  buttonLabel: z.string().max(200).nullish(),
  buttonTarget: z.string().max(40).nullish(),
  audience: z.string().max(60),
  audienceParams: z.object({ pharmacyIds: ids.optional(), partnerIds: ids.optional() }).default({}),
  alsoInApp: z.boolean().default(false),
  /** En centimes. */
  offerAmountCents: z.number().int().nullish(),
  /** Un jour « AAAA-MM-JJ » : l'offre court jusqu'à la fin de ce jour (heure de Paris). */
  offerEndsAt: z.string().max(40).nullish(),
  offerConditions: z.string().max(2000).nullish(),
});

export type CampaignDraftPayload = z.input<typeof draftShape>;

function revalidateCampaigns(campaignId?: string) {
  revalidatePath("/admin/campagnes");
  if (campaignId) revalidatePath(`/admin/campagnes/${campaignId}`);
  revalidatePath("/admin/communications");
}

type RunProgress = { recipientCount: number; sentCount: number; failedCount: number; skippedCount: number; simulated: boolean; complete: boolean };

/** Ce qui s'est passé, en une phrase : un envoi simulé ne se dit jamais réussi. */
function describeRun(run: RunProgress): string {
  const failed = run.failedCount ? `, ${run.failedCount} en échec` : "";
  const skipped = run.skippedCount ? `, ${run.skippedCount} ignorés` : "";
  if (!run.complete) return `Envoi en cours : ${run.sentCount + run.failedCount} destinataires traités sur ${run.recipientCount}. Le reste partira à la reprise (bouton « Reprendre » ou passage quotidien).`;
  if (run.simulated) return `Envoi simulé : la messagerie n'est pas configurée, aucun e-mail n'est parti (${run.sentCount} simulés${failed}${skipped}).`;
  return `Campagne envoyée : ${run.sentCount} e-mails${failed}${skipped}.`;
}

export async function saveCampaignAction(payload: CampaignDraftPayload & { id?: string }): Promise<ActionResult<{ id: string; warnings: string[] }>> {
  const session = await requirePlatformSession();
  const parsed = draftShape.extend({ id: id.optional() }).safeParse(payload);
  if (!parsed.success) return fail("Certaines informations sont à corriger.", zodFieldErrors(parsed.error.issues));
  const { id: campaignId, ...fields } = parsed.data;
  const checked = validateCampaignDraft(fields);
  if (!checked.ok) return fail(checked.error);

  if (campaignId) {
    const result = await updateCampaign(campaignId, checked.value, session.admin.id);
    if (!result.ok) return fail(result.error);
    revalidateCampaigns(campaignId);
    return ok({ id: campaignId, warnings: checked.warnings }, result.backToDraft ? "Campagne modifiée : elle est redevenue un brouillon, il faut la reprogrammer et confirmer de nouveau." : "Campagne enregistrée. Rien n'est envoyé.");
  }
  const created = await createCampaign(checked.value, session.admin.id);
  revalidateCampaigns(created.id);
  return ok({ id: created.id, warnings: checked.warnings }, "Brouillon enregistré. Rien n'est envoyé.");
}

/** Combien de personnes recevraient le message, et qui est écarté (désinscrits, sans adresse, doublons). Lecture seule. */
export async function previewAudienceAction(payload: { audience: string; audienceParams?: { pharmacyIds?: string[]; partnerIds?: string[] } }): Promise<ActionResult<Awaited<ReturnType<typeof previewAudience>>>> {
  await requirePlatformSession();
  const parsed = z.object({ audience: z.enum(AUDIENCE_KEYS as [AudienceKey, ...AudienceKey[]]), audienceParams: z.object({ pharmacyIds: ids.optional(), partnerIds: ids.optional() }).default({}) }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  return ok(await previewAudience(parsed.data.audience, parsed.data.audienceParams));
}

/** Le message tel qu'il partirait, avec des valeurs d'exemple (le montant de l'offre, lui, est réel). */
export async function previewCampaignEmailAction(payload: CampaignDraftPayload): Promise<ActionResult<{ subject: string; text: string; html: string; usesSamples: true }>> {
  await requirePlatformSession();
  const parsed = draftShape.safeParse(payload);
  if (!parsed.success) return fail("Certaines informations sont à corriger.", zodFieldErrors(parsed.error.issues));
  const checked = validateCampaignDraft(parsed.data);
  if (!checked.ok) return fail(checked.error);
  return ok({ ...(await previewCampaignEmail(checked.value)), usesSamples: true });
}

/** Un essai, à soi-même : l'adresse est celle de l'administrateur connecté, jamais une saisie. */
export async function sendCampaignTestAction(payload: CampaignDraftPayload): Promise<ActionResult<{ status: string; detail: string; recipient: string }>> {
  const session = await requirePlatformSession();
  const parsed = draftShape.safeParse(payload);
  if (!parsed.success) return fail("Certaines informations sont à corriger.", zodFieldErrors(parsed.error.issues));
  const checked = validateCampaignDraft(parsed.data);
  if (!checked.ok) return fail(checked.error);
  const result = await sendCampaignTest(checked.value, session.admin.id, session.admin.email);
  revalidatePath("/admin/communications");
  if (result.status === "FAILED") return fail(`Le test n'est pas parti : ${result.detail}`);
  return ok({ ...result, recipient: session.admin.email }, result.status === "SENT" ? `Test envoyé à ${session.admin.email}.` : "Test non transmis : la messagerie n'est pas configurée sur ce serveur.");
}

const confirmation = z.object({ id, confirmedCount: z.number().int().min(0).max(1_000_000), confirmation: z.string().max(40) });

/** Programme l'envoi à un jour : confirmé maintenant (mot retapé, nombre recalculé), il part au passage quotidien de ce jour-là. */
export async function scheduleCampaignAction(payload: { id: string; date: string; confirmedCount: number; confirmation: string }): Promise<ActionResult<{ schedule: string }>> {
  const session = await requirePlatformSession();
  const parsed = confirmation.extend({ date: z.string().max(10) }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  if (!isCampaignConfirmation(parsed.data.confirmation)) return fail(`Pour confirmer, retapez le mot ${CAMPAIGN_CONFIRMATION_WORD}.`);
  if (!isCalendarDay(parsed.data.date)) return fail("Date illisible : choisissez un jour.");
  const day = zonedDayStart(parsed.data.date, TIME_ZONE);
  const result = await scheduleCampaign(parsed.data.id, day, session.admin.id, parsed.data.confirmedCount);
  if (!result.ok) return fail(result.error);
  revalidateCampaigns(parsed.data.id);
  const schedule = describeSchedule(day, new Date());
  return ok({ schedule }, `Campagne programmée. ${schedule}`);
}

export async function unscheduleCampaignAction(payload: { id: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ id }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await unscheduleCampaign(parsed.data.id, session.admin.id);
  if (!result.ok) return fail(result.error);
  revalidateCampaigns(parsed.data.id);
  return ok(null, "Programmation retirée : la campagne est redevenue un brouillon.");
}

/** Envoie maintenant. Le mot « ENVOYER » est retapé et le nombre de destinataires confirmé : le serveur le recalcule et refuse s'il diffère. */
export async function startCampaignAction(payload: { id: string; confirmedCount: number; confirmation: string }): Promise<ActionResult<RunProgress>> {
  const session = await requirePlatformSession();
  const parsed = confirmation.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  if (!isCampaignConfirmation(parsed.data.confirmation)) return fail(`Pour confirmer l'envoi, retapez le mot ${CAMPAIGN_CONFIRMATION_WORD}.`);
  const result = await startCampaign(parsed.data.id, session.admin.id, parsed.data.confirmedCount);
  revalidateCampaigns(parsed.data.id);
  if (!result.ok) return fail(result.error);
  const { recipientCount, sentCount, failedCount, skippedCount, simulated, complete } = result;
  const progress = { recipientCount, sentCount, failedCount, skippedCount, simulated, complete };
  return ok(progress, describeRun(progress));
}

export async function resumeCampaignAction(payload: { id: string }): Promise<ActionResult<{ complete: boolean; sentCount: number; failedCount: number }>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ id }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await resumeCampaign(parsed.data.id, session.admin.id);
  revalidateCampaigns(parsed.data.id);
  if (!result.ok) return fail(result.error);
  return ok({ complete: result.complete, sentCount: result.sentCount, failedCount: result.failedCount }, result.complete ? "Envoi terminé." : "Envoi repris : il reste des destinataires en attente.");
}

export async function cancelCampaignAction(payload: { id: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ id }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await cancelCampaign(parsed.data.id, session.admin.id);
  revalidateCampaigns(parsed.data.id);
  if (!result.ok) return fail(result.error);
  return ok(null, "Campagne annulée. Les messages déjà partis ne se rappellent pas ; les autres ne partiront pas.");
}

export async function deleteDraftCampaignAction(payload: { id: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ id }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await deleteDraftCampaign(parsed.data.id, session.admin.id);
  if (!result.ok) return fail(result.error);
  revalidateCampaigns();
  return ok(null, "Brouillon supprimé.");
}
