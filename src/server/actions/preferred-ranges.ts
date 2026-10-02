"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit } from "@/server/audit/log";
import { isUniverseKey, universeLabel } from "@/config/universes";
import {
  deletePreferredRange,
  productsOfBrand,
  savePreferredRange,
  setPreferredRangeActive,
  type BrandProduct,
} from "@/server/services/preferred-ranges";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Gammes privilégiées par univers : réservées au titulaire
 * (LAB_PROGRAMS_MANAGE). Chaque geste repart de la session — l'officine n'est
 * jamais lue dans la requête — et est tracé au journal d'audit, sans donnée
 * de santé.
 */

const PAGE = "/parametres/laboratoires/gammes";

/** « 12,5 », « 12.5 % » ou vide → 12.5 ou null. */
const percent = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    const text = String(value).replace(/%/g, "").replace(/\s/g, "").replace(",", ".");
    return text === "" ? null : Number(text);
  },
  z
    .number({ error: "Indiquez un pourcentage, par exemple 12 ou 12,5." })
    .min(0, "Le pourcentage ne peut pas être négatif.")
    .max(100, "Le pourcentage ne peut pas dépasser 100.")
    .nullable(),
);

const rangeSchema = z.object({
  id: z.string().min(1).optional().nullable(),
  universe: z.string().refine(isUniverseKey, "Choisissez un univers."),
  laboratory: z.string().trim().min(1, "Indiquez le laboratoire ou la marque.").max(80, "80 caractères au plus."),
  rangeName: z.string().trim().max(80, "80 caractères au plus.").optional().nullable(),
  isActive: z.boolean().default(true),
  priority: z.coerce
    .number({ error: "Indiquez une priorité : 1 = la plus prioritaire." })
    .int("Un nombre entier : 1, 2, 3…")
    .min(1, "1 = la plus prioritaire.")
    .max(99, "99 au plus."),
  discountPercent: percent.optional(),
  notes: z.string().trim().max(500, "500 caractères au plus.").optional().nullable(),
  productIds: z.array(z.string().min(1)).max(300, "300 produits au plus ; au-delà, choisissez « toute la marque ».").default([]),
});

function revalidateRanges() {
  revalidatePath(PAGE);
  revalidatePath("/parametres/laboratoires");
}

/** Crée ou modifie une gamme privilégiée. */
export async function savePreferredRangeAction(payload: z.input<typeof rangeSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const parsed = rangeSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la gamme saisie.", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;

  const result = await savePreferredRange(session.scope, {
    id: input.id ?? null,
    universe: input.universe,
    laboratory: input.laboratory,
    rangeName: input.rangeName ?? null,
    isActive: input.isActive,
    priority: input.priority,
    discountPercent: input.discountPercent ?? null,
    notes: input.notes ?? null,
    productIds: input.productIds,
  });
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);

  await recordAudit({
    action: "range.saved",
    entityType: "PreferredRange",
    entityId: result.data.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: {
      created: result.data.created,
      universe: input.universe,
      brandKey: result.data.brandKey,
      priority: input.priority,
      isActive: input.isActive,
      products: input.productIds.length,
    },
  });

  revalidateRanges();
  const label = input.rangeName?.trim() ? `${input.laboratory.trim()} · ${input.rangeName.trim()}` : input.laboratory.trim();
  return ok({ id: result.data.id }, result.data.created ? `${label} ajouté en ${universeLabel(input.universe)}.` : `${label} enregistré.`);
}

const toggleSchema = z.object({ id: z.string().min(1), isActive: z.boolean() });

/** Active ou désactive une gamme en un clic. */
export async function setPreferredRangeActiveAction(payload: z.input<typeof toggleSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const parsed = toggleSchema.safeParse(payload);
  if (!parsed.success) return fail("Gamme invalide.");

  const result = await setPreferredRangeActive(session.scope, parsed.data.id, parsed.data.isActive);
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "range.saved",
    entityType: "PreferredRange",
    entityId: result.data.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { universe: result.data.universe, isActive: parsed.data.isActive, toggled: true },
  });

  revalidateRanges();
  return ok(null, parsed.data.isActive ? `${result.data.laboratory} réactivé.` : `${result.data.laboratory} désactivé.`);
}

/** Supprime une gamme (la confirmation est demandée dans l'écran). */
export async function deletePreferredRangeAction(id: string): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return fail("Gamme invalide.");

  const result = await deletePreferredRange(session.scope, parsed.data);
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "range.deleted",
    entityType: "PreferredRange",
    entityId: result.data.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { universe: result.data.universe },
  });

  revalidateRanges();
  return ok(null, `${result.data.laboratory} retiré de ${universeLabel(result.data.universe)}.`);
}

/** Les produits de l'officine pour une marque, pour choisir les « produits concernés ». */
export async function listBrandProductsAction(brand: string): Promise<ActionResult<BrandProduct[]>> {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const parsed = z.string().trim().min(1).max(80).safeParse(brand);
  if (!parsed.success) return fail("Indiquez d'abord le laboratoire ou la marque.");
  return ok(await productsOfBrand(session.scope, parsed.data));
}
