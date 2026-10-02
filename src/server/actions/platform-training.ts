"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { normalizeTrainingDraft } from "@/core/training/content";
import { saveGlobalTraining, setGlobalTrainingActive } from "@/server/services/training";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Formations publiées par PharmaBoost pour toutes les officines, depuis la
 * console. Uniquement des liens officiels ou des contenus autorisés par leur
 * auteur. Chaque geste part d'une session administrateur et est tracé. Ces
 * actions ne touchent jamais un contenu propre à une officine.
 */

function revalidateTrainings() {
  revalidatePath("/admin/formations");
  revalidatePath("/formation");
  // Le contenu modifié ou désactivé s'affiche aussi sur sa propre page, dans chaque officine.
  revalidatePath("/formation/[id]", "page");
}

const draftSchema = z.object({
  id: z.string().min(1).max(64).optional().nullable(),
  title: z.string().max(400),
  summary: z.string().max(2000).optional().nullable(),
  kind: z.string().max(40),
  url: z.string().max(4000).optional().nullable(),
  body: z.string().max(20000).optional().nullable(),
  laboratory: z.string().max(200).optional().nullable(),
  brand: z.string().max(200).optional().nullable(),
  rangeName: z.string().max(200).optional().nullable(),
  universe: z.string().max(80).optional().nullable(),
  productCodes: z.string().max(10000).optional().nullable(),
  durationMinutes: z.union([z.string().max(10), z.number()]).optional().nullable(),
  sourceLabel: z.string().max(300).optional().nullable(),
});

export type GlobalTrainingPayload = z.input<typeof draftSchema>;

export async function saveGlobalTrainingAction(payload: GlobalTrainingPayload): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = draftSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le contenu saisi.", zodFieldErrors(parsed.error.issues));

  const draft = normalizeTrainingDraft(parsed.data, "GLOBAL");
  if (!draft.ok) return fail("Vérifiez le contenu saisi.", draft.fieldErrors);

  const result = await saveGlobalTraining(parsed.data.id ?? null, draft.data, session.admin.id);
  if (!result.ok) return fail("Contenu introuvable.");

  await recordAudit({
    action: "training.saved",
    entityType: "TrainingContent",
    entityId: result.id,
    platformAdminId: session.admin.id,
    metadata: { created: result.created, kind: draft.data.kind, laboratory: draft.data.laboratory, universe: draft.data.universe, productCodes: draft.data.productCodes.length },
  });

  revalidateTrainings();
  return ok({ id: result.id }, result.created ? "Formation publiée pour toutes les officines." : "Formation mise à jour.");
}

const activeSchema = z.object({ id: z.string().min(1).max(64), isActive: z.boolean() });

export async function setGlobalTrainingActiveAction(payload: z.input<typeof activeSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = activeSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await setGlobalTrainingActive(parsed.data.id, parsed.data.isActive);
  if (!result.ok) return fail("Contenu introuvable.");

  await recordAudit({
    action: parsed.data.isActive ? "training.saved" : "training.archived",
    entityType: "TrainingContent",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { isActive: parsed.data.isActive },
  });

  revalidateTrainings();
  return ok(null, parsed.data.isActive ? `« ${result.title} » est de nouveau proposée aux officines.` : `« ${result.title} » n'est plus proposée aux officines.`);
}
