"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { addAdminNote, setNotePinned, NOTE_MAX_LENGTH } from "@/server/services/admin/notes";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Notes internes de la console : réservées à l'équipe PharmaBoost, jamais
 * visibles de l'officine ni des commerciaux. Le service relit la cible en base
 * et trace chaque geste dans le journal d'audit.
 */

const id = z.string().trim().min(1).max(64);

const addSchema = z
  .object({
    pharmacyId: id.optional().nullable(),
    prospectId: id.optional().nullable(),
    // La longueur fine (2 à 2000 après nettoyage) est contrôlée par le service.
    body: z.string().max(NOTE_MAX_LENGTH + 500, "La note est trop longue."),
  })
  .refine((v) => Boolean(v.pharmacyId) !== Boolean(v.prospectId), { message: "Une note se rattache à une officine ou à un dossier.", path: ["body"] });

async function revalidateNoteTargets(target: { pharmacyId: string | null; prospectId: string | null }) {
  let pharmacyId = target.pharmacyId;
  let prospectId = target.prospectId;
  // Une note sur un dossier s'affiche aussi sur la fiche de son officine, et inversement.
  if (prospectId && !pharmacyId) pharmacyId = (await prisma.prospect.findUnique({ where: { id: prospectId }, select: { pharmacyId: true } }))?.pharmacyId ?? null;
  if (pharmacyId && !prospectId) prospectId = (await prisma.prospect.findUnique({ where: { pharmacyId }, select: { id: true } }))?.id ?? null;
  if (pharmacyId) revalidatePath(`/admin/pharmacies/${pharmacyId}`);
  if (prospectId) revalidatePath(`/admin/dossiers/${prospectId}`);
}

export async function addAdminNoteAction(payload: z.input<typeof addSchema>): Promise<ActionResult<{ noteId: string }>> {
  const session = await requirePlatformSession();
  const parsed = addSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la note.", zodFieldErrors(parsed.error.issues));
  const result = await addAdminNote({ ...parsed.data, adminId: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error, result.fieldErrors);
  await revalidateNoteTargets(result.note);
  return ok({ noteId: result.note.id }, "Note ajoutée. Elle reste interne à l'équipe PharmaBoost.");
}

const pinSchema = z.object({ noteId: id, pinned: z.boolean() });

export async function setAdminNotePinnedAction(payload: z.input<typeof pinSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = pinSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");
  const result = await setNotePinned(parsed.data.noteId, parsed.data.pinned, session.admin.id);
  if (!result.ok) return fail(result.error);
  await revalidateNoteTargets(result.note);
  return ok(null, parsed.data.pinned ? "Note épinglée en tête de la fiche." : "Note désépinglée.");
}
