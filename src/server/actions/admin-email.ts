"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { recordProspectEvent } from "@/server/services/sales/events";
import { pharmacyRecipient, prospectRecipient, sendTemplatedEmail, templateValuesFor, type Recipient } from "@/server/services/admin/outbound-email";
import { renderTemplate } from "@/server/services/admin/email-templates";
import { emailTemplate, sampleValues, validateTemplateText } from "@/core/admin/email-templates";
import { fail, ok, type ActionResult } from "./types";

/**
 * Écrire à une officine ou à un prospect depuis la console : un modèle du
 * centre de modèles, ajustable avant l'envoi, envoyé au titulaire (ou au
 * contact du dossier) et tracé. Session administrateur exigée à chaque appel.
 */

const target = z.object({ pharmacyId: z.string().min(1).max(60).optional(), prospectId: z.string().min(1).max(60).optional() });
const text = z.object({ subject: z.string().max(200), title: z.string().max(200), body: z.string().max(6000) });

async function resolveRecipient(input: { pharmacyId?: string; prospectId?: string }): Promise<Recipient | null> {
  if (input.pharmacyId) return pharmacyRecipient(input.pharmacyId);
  if (input.prospectId) return prospectRecipient(input.prospectId);
  return null;
}

/** L'aperçu exact de ce qui partira : valeurs réelles du destinataire, ou valeurs d'exemple sans destinataire. */
export async function previewTemplateEmailAction(payload: { templateKey: string; pharmacyId?: string; prospectId?: string; text?: z.input<typeof text> }): Promise<ActionResult<{ subject: string; html: string; recipient: string | null; usesSamples: boolean }>> {
  await requirePlatformSession();
  const parsed = target.extend({ templateKey: z.string().max(80), text: text.optional() }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const definition = emailTemplate(parsed.data.templateKey);
  if (!definition) return fail("Modèle inconnu.");
  const recipient = await resolveRecipient(parsed.data);
  const values = recipient ? await templateValuesFor(recipient) : sampleValues(definition);
  const rendered = await renderTemplate(definition.key, values, parsed.data.text);
  if (!rendered) return fail("Modèle inconnu.");
  return ok({ subject: rendered.subject, html: rendered.html, recipient: recipient?.email ?? null, usesSamples: !recipient });
}

/** Envoie un modèle (texte ajusté) au titulaire d'une officine ou au contact d'un dossier. */
export async function sendManualEmailAction(payload: { templateKey: string; pharmacyId?: string; prospectId?: string; text: z.input<typeof text> }): Promise<ActionResult<{ status: string; detail: string; recipient: string }>> {
  const session = await requirePlatformSession();
  const parsed = target.extend({ templateKey: z.string().max(80), text }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const definition = emailTemplate(parsed.data.templateKey);
  if (!definition) return fail("Modèle inconnu.");
  const checked = validateTemplateText(definition, parsed.data.text);
  if (!checked.ok) return fail("Certaines informations sont à corriger.", checked.errors);
  const recipient = await resolveRecipient(parsed.data);
  if (!recipient) return fail("Aucune adresse e-mail connue pour ce destinataire.");
  const values = await templateValuesFor(recipient);
  const sent = await sendTemplatedEmail({ templateKey: definition.key, recipient, values, textOverride: checked.value, trigger: "MANUAL", adminId: session.admin.id });
  await recordAudit({ action: "platform.email_sent", entityType: recipient.pharmacyId ? "Pharmacy" : "Prospect", entityId: recipient.pharmacyId ?? recipient.prospectId, pharmacyId: recipient.pharmacyId, platformAdminId: session.admin.id, metadata: { templateKey: definition.key, recipient: recipient.email, subject: sent.subject, status: sent.outcome.status } });
  if (recipient.prospectId) {
    await recordProspectEvent({ prospectId: recipient.prospectId, type: "EMAIL_SENT", summary: sent.outcome.status === "SENT" ? `E-mail « ${sent.subject} » envoyé à ${recipient.email} depuis la console.` : `E-mail « ${sent.subject} » NON envoyé à ${recipient.email} : ${sent.outcome.detail}`, actor: { type: "ADMIN", id: session.admin.id, label: session.admin.fullName }, metadata: { templateKey: definition.key, status: sent.outcome.status } });
  }
  if (recipient.pharmacyId) revalidatePath(`/admin/pharmacies/${recipient.pharmacyId}`);
  revalidatePath("/admin/communications");
  if (sent.outcome.status === "FAILED") return fail(`L'e-mail n'est pas parti : ${sent.outcome.detail}`);
  return ok({ status: sent.outcome.status, detail: sent.outcome.detail, recipient: recipient.email }, sent.outcome.status === "SENT" ? `E-mail envoyé à ${recipient.email}.` : "E-mail non transmis : la messagerie n'est pas configurée.");
}

/** Un e-mail de test, à soi-même : texte en cours d'édition, valeurs d'exemple. */
export async function sendTestEmailAction(payload: { templateKey: string; text: z.input<typeof text> }): Promise<ActionResult<{ status: string; recipient: string }>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ templateKey: z.string().max(80), text }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const definition = emailTemplate(parsed.data.templateKey);
  if (!definition) return fail("Modèle inconnu.");
  const checked = validateTemplateText(definition, parsed.data.text);
  if (!checked.ok) return fail("Certaines informations sont à corriger.", checked.errors);
  const recipient: Recipient = { email: session.admin.email, firstName: session.admin.fullName.split(" ")[0] ?? null, fullName: session.admin.fullName, pharmacyId: null, organizationId: null, prospectId: null, pharmacyName: "Officine d'exemple" };
  const values = { ...sampleValues(definition), prenom: recipient.firstName ?? "", titulaire: recipient.fullName ?? "" };
  const sent = await sendTemplatedEmail({ templateKey: definition.key, recipient, values, textOverride: { ...checked.value, subject: `[Test] ${checked.value.subject}` }, trigger: "TEST", adminId: session.admin.id });
  await recordAudit({ action: "platform.email_test_sent", entityType: "EmailTemplate", entityId: definition.key, platformAdminId: session.admin.id, metadata: { recipient: recipient.email, status: sent.outcome.status } });
  if (sent.outcome.status === "FAILED") return fail(`Le test n'est pas parti : ${sent.outcome.detail}`);
  return ok({ status: sent.outcome.status, recipient: recipient.email }, sent.outcome.status === "SENT" ? `Test envoyé à ${recipient.email}.` : "Test non transmis : la messagerie n'est pas configurée sur ce serveur.");
}
