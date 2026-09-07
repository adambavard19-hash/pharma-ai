"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { applyStockMovement } from "@/server/services/catalog";
import { refreshStockNotifications } from "@/server/services/notifications";
import { nextReference } from "@/server/services/references";
import { recordAudit } from "@/server/audit/log";
import { recordIsDemo } from "@/server/db/demo-scope";
import { tagsFromName } from "@/server/services/stock-import";
import { readScannedCode } from "@/core/stock";
import { fail, ok, type ActionResult } from "./types";

/**
 * Le stock au quotidien : une quantité qu'on corrige en deux secondes, un
 * produit qu'on ajoute depuis une recherche. Chaque changement laisse un
 * mouvement — c'est l'historique que le titulaire relit.
 */

const quantitySchema = z.object({
  kind: z.enum(["PRODUCT", "DRUG"]),
  id: z.string().min(1),
  quantity: z.coerce.number().int().min(0).max(999_999),
});

/** « Stock : 8 » devient « Stock : 12 », inventaire consigné. */
export async function setQuantityAction(
  payload: z.input<typeof quantitySchema>,
): Promise<ActionResult<{ quantity: number }>> {
  const session = await requirePermission(PERMISSIONS.STOCK_ADJUST);
  const parsed = quantitySchema.safeParse(payload);
  if (!parsed.success) return fail("Quantité invalide.");
  const { kind, id, quantity } = parsed.data;

  if (kind === "PRODUCT") {
    try {
      const result = await applyStockMovement({
        scope: session.scope,
        productId: id,
        quantityDelta: quantity,
        type: "INVENTORY",
        reason: "Correction manuelle",
      });
      await refreshStockNotifications(session.scope.pharmacyId);
      revalidatePath("/stock");
      revalidatePath(`/stock/${id}`);
      return ok({ quantity: result.quantityAfter }, `Stock : ${result.quantityAfter}`);
    } catch {
      return fail("Produit introuvable dans cette officine.");
    }
  }

  const line = await prisma.pharmacyDrugStock.findUnique({ where: { id }, select: { pharmacyId: true } });
  if (!line || line.pharmacyId !== session.scope.pharmacyId) return fail("Ligne de stock introuvable.");
  const updated = await prisma.pharmacyDrugStock.update({
    where: { id },
    data: { quantity, lastCountedAt: new Date() },
    select: { quantity: true, presentation: { select: { cip13: true } } },
  });
  await recordAudit({
    action: "drug_stock.adjusted",
    entityType: "pharmacy_drug_stock",
    entityId: id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { cip13: updated.presentation.cip13, quantity },
  });
  revalidatePath("/stock");
  return ok({ quantity: updated.quantity }, `Stock : ${updated.quantity}`);
}

const addSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("DRUG"),
    cip13: z.string().min(7),
    quantity: z.coerce.number().int().min(0).max(999_999),
    salePriceCents: z.coerce.number().int().min(0).max(100_000_00).nullable().optional(),
  }),
  z.object({
    kind: z.literal("PRODUCT"),
    productId: z.string().min(1),
    quantity: z.coerce.number().int().min(0).max(999_999),
    salePriceCents: z.coerce.number().int().min(0).max(100_000_00).nullable().optional(),
    purchasePriceCents: z.coerce.number().int().min(0).max(100_000_00).nullable().optional(),
  }),
  z.object({
    kind: z.literal("NEW_PRODUCT"),
    name: z.string().trim().min(2).max(160),
    ean: z.string().trim().max(20).optional().nullable(),
    quantity: z.coerce.number().int().min(0).max(999_999),
    salePriceCents: z.coerce.number().int().min(0).max(100_000_00),
    purchasePriceCents: z.coerce.number().int().min(0).max(100_000_00).nullable().optional(),
  }),
]);

/**
 * Ajouter au stock — sans jamais dupliquer.
 *
 * Un médicament déjà suivi voit sa quantité remplacée ; un produit existant
 * est mis à jour ; un produit nouveau n'est créé que si aucun EAN ni nom
 * identique n'existe déjà dans l'officine.
 */
export async function addToStockAction(
  payload: z.input<typeof addSchema>,
): Promise<ActionResult<{ kind: "DRUG" | "PRODUCT"; id: string; quantity: number }>> {
  const parsed = addSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les informations saisies.");
  const input = parsed.data;

  // La quantité relève du comptoir ; créer un produit ou fixer un prix relève
  // de la gestion du catalogue.
  const session = await requirePermission(
    input.kind === "NEW_PRODUCT" || input.salePriceCents !== undefined
      ? PERMISSIONS.PRODUCT_MANAGE
      : PERMISSIONS.STOCK_ADJUST,
  );
  const scope = session.scope;

  if (input.kind === "DRUG") {
    const scanned = readScannedCode(input.cip13);
    if (scanned.kind !== "CIP13" && scanned.kind !== "CIP7") return fail("Ce code n'est pas un code CIP.");
    const presentation = await prisma.drugPresentation.findUnique({ where: { cip13: scanned.cip13 }, select: { id: true } });
    if (!presentation) return fail("Ce code ne figure pas dans le catalogue national.");
    const line = await prisma.pharmacyDrugStock.upsert({
      where: { pharmacyId_presentationId: { pharmacyId: scope.pharmacyId, presentationId: presentation.id } },
      create: {
        pharmacyId: scope.pharmacyId,
        presentationId: presentation.id,
        quantity: input.quantity,
        priceCents: input.salePriceCents ?? null,
        source: "MANUAL",
        lastCountedAt: new Date(),
      },
      update: {
        quantity: input.quantity,
        ...(input.salePriceCents !== undefined ? { priceCents: input.salePriceCents } : {}),
        lastCountedAt: new Date(),
      },
      select: { id: true, quantity: true },
    });
    await recordAudit({
      action: "drug_stock.adjusted",
      entityType: "pharmacy_drug_stock",
      entityId: line.id,
      pharmacyId: scope.pharmacyId,
      userId: scope.userId,
      metadata: { cip13: scanned.cip13, quantity: line.quantity },
    });
    revalidatePath("/stock");
    return ok({ kind: "DRUG", id: line.id, quantity: line.quantity }, `Ajouté au stock : ${line.quantity} en rayon.`);
  }

  if (input.kind === "PRODUCT") {
    const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { pharmacyId: true } });
    if (!product || product.pharmacyId !== scope.pharmacyId) return fail("Produit introuvable dans cette officine.");
    if (input.salePriceCents !== undefined || input.purchasePriceCents !== undefined) {
      await prisma.product.update({
        where: { id: input.productId },
        data: {
          ...(input.salePriceCents !== undefined && input.salePriceCents !== null ? { salePriceCents: input.salePriceCents } : {}),
          ...(input.purchasePriceCents !== undefined && input.purchasePriceCents !== null ? { purchasePriceCents: input.purchasePriceCents } : {}),
        },
      });
    }
    const result = await applyStockMovement({
      scope,
      productId: input.productId,
      quantityDelta: input.quantity,
      type: "INVENTORY",
      reason: "Ajout au stock",
    });
    await refreshStockNotifications(scope.pharmacyId);
    revalidatePath("/stock");
    return ok({ kind: "PRODUCT", id: input.productId, quantity: result.quantityAfter }, `Stock mis à jour : ${result.quantityAfter}.`);
  }

  // NEW_PRODUCT — un doublon par EAN ou par nom exact met à jour au lieu de créer.
  const ean = input.ean?.replace(/\D/g, "") || null;
  const existing = await prisma.product.findFirst({
    where: {
      pharmacyId: scope.pharmacyId,
      deletedAt: null,
      OR: [...(ean ? [{ ean }] : []), { name: { equals: input.name, mode: "insensitive" as const } }],
    },
    select: { id: true },
  });
  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        salePriceCents: input.salePriceCents,
        ...(input.purchasePriceCents ? { purchasePriceCents: input.purchasePriceCents } : {}),
        ...(ean ? { ean } : {}),
        isActive: true,
      },
    });
    const result = await applyStockMovement({ scope, productId: existing.id, quantityDelta: input.quantity, type: "INVENTORY", reason: "Ajout au stock" });
    await refreshStockNotifications(scope.pharmacyId);
    revalidatePath("/stock");
    return ok({ kind: "PRODUCT", id: existing.id, quantity: result.quantityAfter }, "Produit déjà connu : stock mis à jour.");
  }

  const reference = await nextReference("product", scope.pharmacyId);
  const created = await prisma.product.create({
    data: {
      pharmacyId: scope.pharmacyId,
      organizationId: scope.organizationId,
      name: input.name,
      category: "AUTRE",
      reference,
      ean,
      salePriceCents: input.salePriceCents,
      purchasePriceCents: input.purchasePriceCents ?? 0,
      matchingTags: tagsFromName(input.name),
      isDemo: recordIsDemo(session.pharmacy.isDemo),
      stockItem: { create: { pharmacyId: scope.pharmacyId, quantity: input.quantity, alertThreshold: 5, lastCountedAt: new Date() } },
    },
    select: { id: true },
  });
  await prisma.stockMovement.create({
    data: {
      pharmacyId: scope.pharmacyId,
      productId: created.id,
      type: "INVENTORY",
      quantityDelta: input.quantity,
      quantityAfter: input.quantity,
      reason: "Ajout au stock",
      userId: scope.userId,
    },
  });
  await recordAudit({
    action: "product.created",
    entityType: "Product",
    entityId: created.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { reference, name: input.name },
  });
  await refreshStockNotifications(scope.pharmacyId);
  revalidatePath("/stock");
  return ok({ kind: "PRODUCT", id: created.id, quantity: input.quantity }, "Produit ajouté au stock.");
}
