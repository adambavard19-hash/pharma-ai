"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePlatformSession, type PlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { adminMoveProspect, cancelDemo, clearProspectFollowUp, completeTask, markDemoDone, scheduleDemo, setProspectFollowUp, type AdminActor } from "@/server/services/sales/prospects";
import { PROSPECT_STATUS_LABELS } from "@/core/sales/pipeline";
import { isProspectStatus, validateDemoDate, validateFollowUpDate } from "@/core/sales/board";
import { formatDate, formatDateTime } from "@/lib/format";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les gestes de l'espace Commercial de la console : déplacer un dossier sur
 * le pipeline, programmer / marquer / annuler une démonstration, fixer ou
 * solder une relance. Chaque geste revérifie le dossier en base, est
 * historisé sur le dossier et journalisé dans l'audit (par le service).
 */

const actorOf = (session: PlatformSession): AdminActor => ({ type: "ADMIN", id: session.admin.id, label: session.admin.fullName });

/** Les pages de l'espace qui affichent dossiers, démos et relances. */
function revalidateCommercial(prospectId?: string) {
  for (const path of ["/admin/pipeline", "/admin/prospects", "/admin/demonstrations", "/admin/relances-commerciales", "/admin/commerciaux"]) revalidatePath(path);
  revalidatePath("/admin/commerciaux/[id]", "page");
  if (prospectId) revalidatePath(`/admin/dossiers/${prospectId}`);
}

const id = z.string().trim().min(1, "Dossier manquant.").max(64);
const isoDate = z.iso.datetime({ offset: true, message: "Date invalide." });
const optionalText = (max: number) => z.string().trim().max(max, `${max} caractères au plus.`).optional().nullable();

const moveSchema = z.object({
  prospectId: id,
  to: z.string().refine(isProspectStatus, "Étape inconnue."),
  reason: optionalText(500),
  demoAt: isoDate.optional().nullable(),
  note: optionalText(500),
});

/** Un déplacement sur le tableau du pipeline (glisser-déposer ou menu « Déplacer vers… »). */
export async function moveProspectAction(payload: z.input<typeof moveSchema>): Promise<ActionResult<{ status: string }>> {
  const session = await requirePlatformSession();
  const parsed = moveSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Déplacement invalide.", zodFieldErrors(parsed.error.issues));
  const { prospectId, to, reason, note } = parsed.data;
  const demoAt = parsed.data.demoAt ? new Date(parsed.data.demoAt) : null;
  if (demoAt) {
    const check = validateDemoDate(demoAt, new Date());
    if (!check.ok) return fail(check.error, { demoAt: check.error });
  }
  const result = await adminMoveProspect(prospectId, to, actorOf(session), { reason, demoAt, note });
  if (!result.ok) return fail(result.error);
  revalidateCommercial(prospectId);
  const label = PROSPECT_STATUS_LABELS[result.status];
  return ok({ status: result.status }, demoAt ? `Démonstration programmée le ${formatDateTime(demoAt)}.` : `Dossier déplacé en « ${label} ».`);
}

const demoSchema = z.object({ prospectId: id, at: isoDate, note: optionalText(500) });

/** Programme (ou reprogramme) une démonstration. */
export async function scheduleDemoAction(payload: z.input<typeof demoSchema>): Promise<ActionResult<{ status: string; taskId: string | null }>> {
  const session = await requirePlatformSession();
  const parsed = demoSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez la démonstration.", zodFieldErrors(parsed.error.issues));
  const at = new Date(parsed.data.at);
  const check = validateDemoDate(at, new Date());
  if (!check.ok) return fail(check.error, { at: check.error });
  const result = await scheduleDemo(parsed.data.prospectId, at, actorOf(session), parsed.data.note);
  if (!result.ok) return fail(result.error);
  revalidateCommercial(parsed.data.prospectId);
  return ok({ status: result.status, taskId: result.taskId }, `Démonstration programmée le ${formatDateTime(at)}.${result.taskId ? " Elle apparaît dans l'agenda du commercial." : ""}`);
}

const demoDoneSchema = z.object({ prospectId: id, note: optionalText(500) });

export async function markDemoDoneAction(payload: z.input<typeof demoDoneSchema>): Promise<ActionResult<{ status: string }>> {
  const session = await requirePlatformSession();
  const parsed = demoDoneSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Requête invalide.");
  const result = await markDemoDone(parsed.data.prospectId, actorOf(session), { note: parsed.data.note });
  if (!result.ok) return fail(result.error);
  revalidateCommercial(parsed.data.prospectId);
  return ok({ status: result.status }, "Démonstration marquée réalisée.");
}

const cancelSchema = z.object({ prospectId: id, reason: z.string().trim().min(5, "Indiquez le motif (au moins 5 caractères).").max(500) });

/** Annule une démonstration à venir : geste confirmé, motif obligatoire. */
export async function cancelDemoAction(payload: z.input<typeof cancelSchema>): Promise<ActionResult<{ status: string }>> {
  const session = await requirePlatformSession();
  const parsed = cancelSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Requête invalide.", zodFieldErrors(parsed.error.issues));
  const result = await cancelDemo(parsed.data.prospectId, actorOf(session), parsed.data.reason);
  if (!result.ok) return fail(result.error);
  revalidateCommercial(parsed.data.prospectId);
  return ok({ status: result.status }, "Démonstration annulée.");
}

const followUpSchema = z.object({ prospectId: id, dueAt: isoDate, label: z.string().trim().min(2, "Indiquez l'objet de la relance.").max(160) });

/** Fixe une relance sur un dossier ouvert. */
export async function setFollowUpAction(payload: z.input<typeof followUpSchema>): Promise<ActionResult<{ taskId: string | null }>> {
  const session = await requirePlatformSession();
  const parsed = followUpSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez la relance.", zodFieldErrors(parsed.error.issues));
  const dueAt = new Date(parsed.data.dueAt);
  const check = validateFollowUpDate(dueAt, new Date());
  if (!check.ok) return fail(check.error, { dueAt: check.error });
  const result = await setProspectFollowUp(parsed.data.prospectId, dueAt, parsed.data.label, actorOf(session));
  if (!result.ok) return fail(result.error);
  revalidateCommercial(parsed.data.prospectId);
  return ok({ taskId: result.taskId }, `Relance fixée au ${formatDate(dueAt)}.${result.taskId ? " Elle apparaît dans l'agenda du commercial." : ""}`);
}

const completeSchema = z.union([z.object({ taskId: id }), z.object({ prospectId: id })]);

/**
 * Marque une relance faite : une tâche de l'agenda d'un commercial, ou la
 * prochaine action d'un dossier qui n'en a pas (dossier de la console).
 */
export async function completeFollowUpAction(payload: z.input<typeof completeSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = completeSchema.safeParse(payload);
  if (!parsed.success) return fail("Relance introuvable.");
  const actor = actorOf(session);
  if ("taskId" in parsed.data) {
    const task = await prisma.salesTask.findUnique({ where: { id: parsed.data.taskId }, select: { id: true, prospectId: true, label: true, dueAt: true, doneAt: true, salesRepId: true } });
    if (!task) return fail("Relance introuvable.");
    if (task.doneAt) return fail("Cette relance est déjà marquée faite.");
    await completeTask(task.id, actor);
    await recordAudit({ action: "sales.followup_set", entityType: "Prospect", entityId: task.prospectId, platformAdminId: session.admin.id, metadata: { done: true, taskId: task.id, label: task.label, dueAt: task.dueAt.toISOString(), salesRepId: task.salesRepId } });
    revalidateCommercial(task.prospectId);
    return ok(null, `Relance « ${task.label} » marquée faite.`);
  }
  const result = await clearProspectFollowUp(parsed.data.prospectId, actor);
  if (!result.ok) return fail(result.error);
  revalidateCommercial(parsed.data.prospectId);
  return ok(null, "Prochaine action marquée faite.");
}
