"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { resetTemplate, saveTemplate } from "@/server/services/admin/email-templates";
import { previewRule, runAutomations, saveRule, type AutomationRunItem, type AutomationRunReport } from "@/server/services/admin/automations";
import { automationRule, describeOffset } from "@/core/admin/automations";
import { isEmailTemplateKey } from "@/core/admin/email-templates";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les gestes du centre de communication : modèles d'e-mails et relances
 * automatiques. Session administrateur exigée à chaque appel ; chaque
 * modification va au journal d'audit avec l'avant et l'après (dans les
 * services appelés).
 */

const templateKey = z.string().min(1).max(80).refine(isEmailTemplateKey, "Modèle inconnu.");
const templateText = z.object({ subject: z.string().max(200), title: z.string().max(200), body: z.string().max(6000) });
const ruleKey = z.string().min(1).max(80).refine((key) => automationRule(key) !== null, "Règle inconnue.");

function revalidateTemplates(key?: string) {
  revalidatePath("/admin/emails/modeles");
  if (key) revalidatePath(`/admin/emails/modeles/${key}`);
  revalidatePath("/admin/relances");
}

export async function saveTemplateAction(payload: { key: string; text: z.input<typeof templateText> }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ key: templateKey, text: templateText }).safeParse(payload);
  if (!parsed.success) return fail("Certaines informations sont à corriger.", zodFieldErrors(parsed.error.issues));
  const result = await saveTemplate(parsed.data.key, parsed.data.text, session.admin.id);
  if (!result.ok) return fail(result.error, result.fieldErrors);
  revalidateTemplates(parsed.data.key);
  return ok(null, "Modèle enregistré : il s'applique aux prochains envois.");
}

export async function resetTemplateAction(payload: { key: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ key: templateKey }).safeParse(payload);
  if (!parsed.success) return fail("Modèle inconnu.");
  const result = await resetTemplate(parsed.data.key, session.admin.id);
  if (!result.ok) return fail(result.error);
  revalidateTemplates(parsed.data.key);
  return ok(null, "Texte par défaut rétabli. L'ancien texte reste dans le journal d'audit.");
}

export async function saveAutomationRuleAction(payload: { key: string; enabled: boolean; offsetDays: number }): Promise<ActionResult<{ enabled: boolean; offsetDays: number }>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ key: ruleKey, enabled: z.boolean(), offsetDays: z.number().int().min(-60).max(60) }).safeParse(payload);
  if (!parsed.success) return fail("Réglage invalide.", zodFieldErrors(parsed.error.issues));
  const result = await saveRule(parsed.data.key, { enabled: parsed.data.enabled, offsetDays: parsed.data.offsetDays }, session.admin.id);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/relances");
  const { rule } = result;
  const message = rule.enabled ? `« ${rule.label} » activée (${describeOffset(rule.offsetDays)}).` : `« ${rule.label} » désactivée : plus rien ne part pour cette règle.`;
  return ok({ enabled: rule.enabled, offsetDays: rule.offsetDays }, message);
}

/** Un élément d'aperçu, prêt à traverser vers le client. */
export type AutomationPreviewItem = Omit<AutomationRunItem, "dueAt"> & { dueAt: string };

function serializeItems(items: AutomationRunItem[]): AutomationPreviewItem[] {
  return items.map((item) => ({ ...item, dueAt: item.dueAt.toISOString() }));
}

/**
 * Ce qui partirait aujourd'hui. Avec `ruleKey`, la seule règle donnée, comme
 * si elle était active avec ce délai (fenêtre d'activation) ; sans, toutes
 * les règles actives. Lecture seule : rien n'est écrit, rien ne part.
 */
export async function previewAutomationsAction(payload: { ruleKey?: string; offsetDays?: number } = {}): Promise<ActionResult<{ items: AutomationPreviewItem[]; enabledRules: number | null; alreadyDone: number | null }>> {
  await requirePlatformSession();
  const parsed = z.object({ ruleKey: ruleKey.optional(), offsetDays: z.number().int().min(-60).max(60).optional() }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  if (parsed.data.ruleKey) {
    const items = await previewRule(parsed.data.ruleKey, parsed.data.offsetDays ?? null, new Date());
    if (!items) return fail("Règle inconnue.");
    return ok({ items: serializeItems(items), enabledRules: null, alreadyDone: null });
  }
  const report = await runAutomations({ now: new Date(), dryRun: true });
  return ok({ items: serializeItems(report.items), enabledRules: report.enabledRules, alreadyDone: report.alreadyDone });
}

export type AutomationRunSummary = Omit<AutomationRunReport, "items" | "errors"> & { errors: number };

/** Lance réellement les relances dues, maintenant. Tracé au journal (`platform.automation_run`). */
export async function runAutomationsAction(): Promise<ActionResult<AutomationRunSummary>> {
  const session = await requirePlatformSession();
  const report = await runAutomations({ now: new Date(), dryRun: false, adminId: session.admin.id });
  revalidatePath("/admin/relances");
  revalidatePath("/admin/communications");
  revalidatePath("/admin/notifications");
  const errors = report.errors;
  const summary: AutomationRunSummary = { dryRun: report.dryRun, enabledRules: report.enabledRules, planned: report.planned, sent: report.sent, failed: report.failed, simulated: report.simulated, skipped: report.skipped, internal: report.internal, alreadyDone: report.alreadyDone, errors: errors.length };
  if (report.enabledRules === 0) return ok(summary, "Aucune règle activée : rien n'est parti.");
  const parts = [
    `${report.sent} envoyé${report.sent > 1 ? "s" : ""}`,
    report.simulated ? `${report.simulated} non transmis (messagerie non configurée)` : null,
    report.internal ? `${report.internal} alerte${report.internal > 1 ? "s" : ""} interne${report.internal > 1 ? "s" : ""}` : null,
    report.skipped ? `${report.skipped} ignoré${report.skipped > 1 ? "s" : ""}` : null,
    report.failed ? `${report.failed} en échec` : null,
    errors.length ? `${errors.length} erreur${errors.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  if (report.planned === 0) return ok(summary, "Passage terminé : rien n'était dû aujourd'hui.");
  return ok(summary, `Passage terminé : ${parts.join(", ")}.`);
}
