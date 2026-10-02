"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit } from "@/server/audit/log";
import { normalizeTrainingDraft } from "@/core/training/content";
import { TRAINING_STATUSES } from "@/core/training/progress";
import {
  savePharmacyTraining,
  searchPharmacyProducts,
  setPharmacyTrainingActive,
  setProgress,
} from "@/server/services/training";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Formation, côté officine.
 *
 * La progression est celle de la personne connectée, dans l'officine de sa
 * session : ni l'une ni l'autre ne vient du client. Les contenus propres à
 * l'officine se gèrent avec TRAINING_MANAGE (titulaire). Tout identifiant
 * reçu est relu par le service avec le filtre de l'officine avant d'être lu
 * ou modifié.
 */

function revalidateTraining(contentId?: string) {
  revalidatePath("/formation");
  if (contentId) revalidatePath(`/formation/${contentId}`);
}

const progressSchema = z.object({
  contentId: z.string().min(1).max(64),
  status: z.enum(TRAINING_STATUSES).optional(),
  percent: z.coerce.number().int().min(0).max(100).optional(),
});

export async function setTrainingProgressAction(
  payload: z.input<typeof progressSchema>,
): Promise<ActionResult<{ status: string; percent: number }>> {
  const session = await requirePermission(PERMISSIONS.TRAINING_VIEW);
  const parsed = progressSchema.safeParse(payload);
  if (!parsed.success) return fail("Progression invalide.");
  const { contentId, status, percent } = parsed.data;
  if (status === undefined && percent === undefined) return fail("Progression invalide.");

  const result = await setProgress(session.scope, contentId, { status, percent });
  if (!result.ok) {
    return fail(result.reason === "QUIZ" ? "Les quiz arrivent bientôt : rien à enregistrer pour l'instant." : "Formation introuvable.");
  }

  await recordAudit({
    action: "training.progress_updated",
    entityType: "TrainingContent",
    entityId: contentId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { status: result.status, percent: result.percent },
  });

  revalidateTraining(contentId);
  const message = result.status === "DONE" ? "Formation terminée. Bravo !" : result.status === "IN_PROGRESS" ? "Formation commencée." : "Formation remise à faire.";
  return ok({ status: result.status, percent: result.percent }, message);
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
  productIds: z.array(z.string().min(1).max(64)).max(200).optional().nullable(),
  durationMinutes: z.union([z.string().max(10), z.number()]).optional().nullable(),
  sourceLabel: z.string().max(300).optional().nullable(),
});

export type PharmacyTrainingPayload = z.input<typeof draftSchema>;

/** Crée ou modifie un contenu de formation propre à l'officine. */
export async function savePharmacyTrainingAction(payload: PharmacyTrainingPayload): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(PERMISSIONS.TRAINING_MANAGE);
  const parsed = draftSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le contenu saisi.", zodFieldErrors(parsed.error.issues));

  const draft = normalizeTrainingDraft(parsed.data, "PHARMACY");
  if (!draft.ok) return fail("Vérifiez le contenu saisi.", draft.fieldErrors);

  const result = await savePharmacyTraining(session.scope, parsed.data.id ?? null, draft.data);
  if (!result.ok) {
    return result.reason === "PRODUCT_NOT_FOUND"
      ? fail("Un des produits choisis n'est pas dans votre officine.", { productIds: "Produit introuvable dans cette officine." })
      : fail("Contenu introuvable dans cette officine.");
  }

  await recordAudit({
    action: "training.saved",
    entityType: "TrainingContent",
    entityId: result.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { created: result.created, kind: draft.data.kind, universe: draft.data.universe, products: draft.data.productIds.length },
  });

  revalidateTraining(result.id);
  return ok({ id: result.id }, result.created ? "Contenu publié pour votre équipe." : "Contenu mis à jour.");
}

const activeSchema = z.object({ id: z.string().min(1).max(64), isActive: z.boolean() });

/** Désactive (ou réactive) un contenu de l'officine. On n'efface pas : la progression de l'équipe est conservée. */
export async function setPharmacyTrainingActiveAction(payload: z.input<typeof activeSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.TRAINING_MANAGE);
  const parsed = activeSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await setPharmacyTrainingActive(session.scope, parsed.data.id, parsed.data.isActive);
  if (!result.ok) return fail("Contenu introuvable dans cette officine.");

  await recordAudit({
    action: parsed.data.isActive ? "training.saved" : "training.archived",
    entityType: "TrainingContent",
    entityId: parsed.data.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { isActive: parsed.data.isActive },
  });

  revalidateTraining(parsed.data.id);
  return ok(null, parsed.data.isActive ? `« ${result.title} » est de nouveau proposé à l'équipe.` : `« ${result.title} » n'est plus proposé à l'équipe.`);
}

/** Produits de l'officine à rattacher à un contenu. */
export async function searchTrainingProductsAction(query: string): Promise<ActionResult<{ id: string; name: string; brand: string | null }[]>> {
  const session = await requirePermission(PERMISSIONS.TRAINING_MANAGE);
  const parsed = z.string().max(80).safeParse(query);
  if (!parsed.success) return ok([]);
  return ok(await searchPharmacyProducts(session.scope, parsed.data));
}
