import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { platformEmailContext } from "@/server/services/email-context";
import { EMAIL_TEMPLATES, emailTemplate, renderTemplateEmail, validateTemplateText, type EmailTemplateDefinition, type TemplateText } from "@/core/admin/email-templates";
import type { RenderedEmail } from "@/core/platform/email-layout";

/**
 * Les modèles d'e-mails modifiables : le texte en base s'il a été réécrit,
 * sinon le texte par défaut du code. Toute modification est tracée avec
 * l'avant et l'après.
 */

export type LoadedTemplate = { definition: EmailTemplateDefinition; text: TemplateText; customized: boolean; updatedAt: Date | null; updatedByAdminId: string | null };

export async function loadTemplate(key: string): Promise<LoadedTemplate | null> {
  const definition = emailTemplate(key);
  if (!definition) return null;
  const row = await prisma.emailTemplate.findUnique({ where: { key } });
  return row
    ? { definition, text: { subject: row.subject, title: row.title, body: row.body }, customized: true, updatedAt: row.updatedAt, updatedByAdminId: row.updatedByAdminId }
    : { definition, text: definition.defaults, customized: false, updatedAt: null, updatedByAdminId: null };
}

export async function loadTemplateOverrides(): Promise<Map<string, { subject: string; title: string; body: string; updatedAt: Date; updatedByAdminId: string | null }>> {
  const rows = await prisma.emailTemplate.findMany();
  return new Map(rows.map((r) => [r.key, { subject: r.subject, title: r.title, body: r.body, updatedAt: r.updatedAt, updatedByAdminId: r.updatedByAdminId }]));
}

export async function saveTemplate(key: string, input: TemplateText, adminId: string): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const current = await loadTemplate(key);
  if (!current) return { ok: false, error: "Modèle inconnu." };
  const checked = validateTemplateText(current.definition, input);
  if (!checked.ok) return { ok: false, error: "Certaines informations sont à corriger.", fieldErrors: checked.errors };
  await prisma.emailTemplate.upsert({ where: { key }, update: { ...checked.value, updatedByAdminId: adminId }, create: { key, ...checked.value, updatedByAdminId: adminId } });
  await recordAudit({ action: "platform.email_template_saved", entityType: "EmailTemplate", entityId: key, platformAdminId: adminId, metadata: { before: current.text, after: checked.value, wasCustomized: current.customized } });
  return { ok: true };
}

/** Revient au texte par défaut : la ligne en base disparaît, l'ancien texte reste dans le journal. */
export async function resetTemplate(key: string, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await loadTemplate(key);
  if (!current) return { ok: false, error: "Modèle inconnu." };
  if (!current.customized) return { ok: true };
  await prisma.emailTemplate.delete({ where: { key } });
  await recordAudit({ action: "platform.email_template_reset", entityType: "EmailTemplate", entityId: key, platformAdminId: adminId, metadata: { before: current.text } });
  return { ok: true };
}

/** Le rendu d'un modèle, avec le texte en base (ou un texte en cours d'édition) et des valeurs données. */
export async function renderTemplate(key: string, values: Record<string, string | null | undefined>, textOverride?: TemplateText): Promise<RenderedEmail | null> {
  const loaded = await loadTemplate(key);
  if (!loaded) return null;
  const ctx = await platformEmailContext();
  return renderTemplateEmail(ctx, loaded.definition, textOverride ?? loaded.text, values);
}

export type ContactTemplate = { key: string; label: string; category: string; audience: string; text: TemplateText; customized: boolean };

/** Tous les modèles, avec leur texte courant : pour la fenêtre « Contacter » et le centre de modèles. */
export async function loadAllTemplates(): Promise<ContactTemplate[]> {
  const overrides = await loadTemplateOverrides();
  return EMAIL_TEMPLATES.map((definition) => {
    const row = overrides.get(definition.key);
    return { key: definition.key, label: definition.label, category: definition.category, audience: definition.audience, text: row ? { subject: row.subject, title: row.title, body: row.body } : definition.defaults, customized: Boolean(row) };
  });
}
