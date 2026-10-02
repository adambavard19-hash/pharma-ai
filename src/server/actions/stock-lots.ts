"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit } from "@/server/audit/log";
import { deleteLot, resolveLot, saveLot, searchStockItems, updateThresholds, type StockItemChoice } from "@/server/services/stock-lots";
import { LOT_RESOLUTIONS, LOT_RESOLUTION_LABELS, formatExpiry, parseExpiryInput, toIsoDay } from "@/core/stock/expiry-input";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Dates courtes : saisir un lot, le sortir du suivi, régler les seuils.
 *
 * Aucune de ces actions ne touche à la quantité du stock : le logiciel de
 * gestion reste la référence. Chaque action revérifie la permission (masquer
 * un bouton ne protège rien) et ne lit l'officine que dans la session.
 */

function revalidateLots(productId?: string | null) {
  revalidatePath("/stock/dates-courtes");
  revalidatePath("/stock");
  if (productId) revalidatePath(`/stock/${productId}`);
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

const saveSchema = z.object({
  id: z.string().min(1).optional().nullable(),
  kind: z.enum(["PRODUCT", "DRUG"]).optional().nullable(),
  targetId: z.string().min(1).optional().nullable(),
  lotNumber: optionalText(40),
  expiry: z.string().trim().min(1, "Indiquez la date de péremption.").max(40),
  quantity: z.number().int("Quantité en boîtes entières.").min(1, "Au moins une boîte, ou laissez vide.").max(99_999).optional().nullable(),
  note: optionalText(300),
});

/** Ajoute (ou corrige) un lot et sa date de péremption. */
export async function saveLotAction(payload: z.input<typeof saveSchema>): Promise<ActionResult<{ id: string; created: boolean }>> {
  const session = await requirePermission(PERMISSIONS.STOCK_ADJUST);
  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le lot saisi.", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;

  // La date est relue ici : le serveur ne se fie jamais à la lecture faite à l'écran.
  const expiry = parseExpiryInput(input.expiry);
  if (!expiry) return fail("Date non reconnue.", { expiry: "Date non reconnue : écrivez par exemple 03/2027 ou 31/03/2027." });

  if (!input.id && (!input.kind || !input.targetId)) return fail("Choisissez un produit ou un médicament de votre stock.", { targetId: "Choisissez une référence du stock." });

  const result = await saveLot(session.scope, {
    id: input.id ?? null,
    productId: !input.id && input.kind === "PRODUCT" ? input.targetId : null,
    presentationId: !input.id && input.kind === "DRUG" ? input.targetId : null,
    lotNumber: input.lotNumber,
    expiresOn: expiry.expiresOn,
    precision: expiry.precision,
    quantity: input.quantity ?? null,
    note: input.note,
  });
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "stock.lot_saved",
    entityType: "StockLot",
    entityId: result.data.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: {
      created: result.data.created,
      productId: result.data.productId,
      presentationId: result.data.presentationId,
      expiresOn: toIsoDay(expiry.expiresOn),
      precision: expiry.precision,
      quantity: input.quantity ?? null,
    },
  });

  revalidateLots(result.data.productId);
  return ok(
    { id: result.data.id, created: result.data.created },
    `${result.data.label} : péremption ${formatExpiry(expiry.expiresOn, expiry.precision)} ${result.data.created ? "enregistrée" : "mise à jour"}.`,
  );
}

const resolveSchema = z.object({
  id: z.string().min(1),
  resolution: z.enum(LOT_RESOLUTIONS),
});

/** Sort un lot du suivi : vendu, retourné ou détruit. Le stock n'est pas décrémenté. */
export async function resolveLotAction(payload: z.input<typeof resolveSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.STOCK_ADJUST);
  const parsed = resolveSchema.safeParse(payload);
  if (!parsed.success) return fail("Sortie invalide.");

  const result = await resolveLot(session.scope, parsed.data.id, parsed.data.resolution);
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "stock.lot_resolved",
    entityType: "StockLot",
    entityId: result.data.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { resolution: parsed.data.resolution, productId: result.data.productId, presentationId: result.data.presentationId },
  });

  revalidateLots(result.data.productId);
  return ok(null, `${result.data.label} : lot sorti du suivi (${LOT_RESOLUTION_LABELS[parsed.data.resolution].toLowerCase()}).`);
}

/** Supprime une saisie erronée. */
export async function deleteLotAction(id: string): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.STOCK_ADJUST);
  if (typeof id !== "string" || !id) return fail("Lot introuvable.");

  const result = await deleteLot(session.scope, id);
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "stock.lot_deleted",
    entityType: "StockLot",
    entityId: result.data.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { productId: result.data.productId, presentationId: result.data.presentationId },
  });

  revalidateLots(result.data.productId);
  return ok(null, "Saisie supprimée.");
}

const thresholdsSchema = z.object({
  soonDays: z.number().int("Un nombre de jours entier.").min(1, "Au moins 1 jour.").max(730, "Deux ans au plus."),
  urgentDays: z.number().int("Un nombre de jours entier.").min(0, "Pas de valeur négative.").max(730, "Deux ans au plus."),
});

/** Les seuils « bientôt » et « urgent » de l'officine. */
export async function updateShortDateThresholdsAction(payload: z.input<typeof thresholdsSchema>): Promise<ActionResult<{ soonDays: number; urgentDays: number }>> {
  const session = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const parsed = thresholdsSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les seuils.", zodFieldErrors(parsed.error.issues));
  if (parsed.data.urgentDays > parsed.data.soonDays) {
    return fail("Le seuil « urgent » ne peut pas dépasser le seuil « bientôt ».", { urgentDays: "Au plus le seuil « bientôt »." });
  }

  const thresholds = await updateThresholds(session.scope, parsed.data);

  await recordAudit({
    action: "stock.short_date_settings_updated",
    entityType: "Pharmacy",
    entityId: session.scope.pharmacyId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { ...thresholds },
  });

  revalidateLots();
  return ok(thresholds, `Seuils enregistrés : bientôt à ${thresholds.soonDays} j, urgent à ${thresholds.urgentDays} j.`);
}

/** Recherche d'une référence du stock pour la saisie d'un lot. */
export async function searchStockItemsAction(query: string): Promise<ActionResult<StockItemChoice[]>> {
  const session = await requirePermission(PERMISSIONS.STOCK_ADJUST);
  if (typeof query !== "string") return ok([]);
  return ok(await searchStockItems(session.scope, query));
}
