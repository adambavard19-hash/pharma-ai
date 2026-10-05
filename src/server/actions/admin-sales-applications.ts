"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { SALES_APPLICATION_STATUSES, SALES_APPLICATION_STATUS_LABELS } from "@/core/sales-applications/status";
import { addSalesApplicationNote, convertSalesApplication, moveSalesApplication } from "@/server/services/sales-applications/admin";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Candidatures commerciales, gestes de la console : changer le statut,
 * annoter, transformer en commercial. Chaque geste part d'une session
 * administrateur (la première ligne de chaque action), revérifie les
 * identifiants reçus et est tracé par le service.
 */

function revalidateApplication(id: string) {
  revalidatePath("/admin/candidatures-commerciales");
  revalidatePath(`/admin/candidatures-commerciales/${id}`);
}

const id = z.string().min(1).max(64);

const moveSchema = z.object({ id, to: z.enum(SALES_APPLICATION_STATUSES) });

export async function moveSalesApplicationAction(payload: z.input<typeof moveSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = moveSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await moveSalesApplication(parsed.data.id, parsed.data.to, session.admin.id);
  if (!result.ok) {
    const messages = {
      NOT_FOUND: "Candidature introuvable.",
      SAME_STATUS: "La candidature a déjà ce statut.",
      CONVERTED: "Cette candidature est déjà devenue un commercial : son statut ne change plus.",
      CONFLICT: "La candidature a changé entre-temps. Rechargez la page.",
    } as const;
    return fail(messages[result.reason]);
  }
  revalidateApplication(parsed.data.id);
  return ok(null, `Candidature passée en « ${SALES_APPLICATION_STATUS_LABELS[result.to]} ».`);
}

const noteSchema = z.object({ id, note: z.string().trim().min(1, "Écrivez la note.").max(4000, "4 000 caractères au plus.") });

export async function addSalesApplicationNoteAction(payload: z.input<typeof noteSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = noteSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la note.", zodFieldErrors(parsed.error.issues));

  const result = await addSalesApplicationNote(parsed.data.id, parsed.data.note, session.admin.id);
  if (!result.ok) return fail("Candidature introuvable.");
  revalidateApplication(parsed.data.id);
  return ok(null, "Note ajoutée à l'historique.");
}

const convertSchema = z.object({ id, invite: z.boolean().optional() });

export async function convertSalesApplicationAction(payload: z.input<typeof convertSchema>): Promise<ActionResult<{ salesRepId: string }>> {
  const session = await requirePlatformSession();
  const parsed = convertSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await convertSalesApplication(parsed.data.id, session.admin.id, { invite: parsed.data.invite });
  if (!result.ok) {
    const messages = {
      NOT_FOUND: "Candidature introuvable.",
      NOT_ACCEPTED: "Acceptez d'abord la candidature : seule une candidature acceptée devient un commercial.",
      ALREADY_CONVERTED: "Cette candidature a déjà été transformée en commercial.",
      EMAIL_TAKEN: "Un commercial existe déjà avec cette adresse e-mail.",
      INVALID: `Les informations de la candidature ne permettent pas de créer le commercial${result.detail ? ` (${result.detail})` : ""}.`,
      CONFLICT: "La candidature a changé entre-temps. Rechargez la page.",
    } as const;
    revalidateApplication(parsed.data.id);
    return fail(messages[result.reason]);
  }

  revalidateApplication(parsed.data.id);
  revalidatePath("/admin/commerciaux");
  const invitation = result.invitation === null ? "Aucune invitation envoyée." : result.invitation.status === "SENT" ? "Invitation envoyée." : `Invitation NON envoyée : ${result.invitation.detail}`;
  return ok({ salesRepId: result.salesRepId }, `${result.name} est maintenant commercial(e). ${invitation}`);
}
