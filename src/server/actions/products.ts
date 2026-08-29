"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { applyStockMovement } from "@/server/services/catalog";
import { refreshStockNotifications, createNotification } from "@/server/services/notifications";
import { nextReference } from "@/server/services/references";
import { recordAudit } from "@/server/audit/log";
import { parseAmountToCents } from "@/lib/format";
import { isDemoMode } from "@/config/env";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";
import { PRODUCT_CATEGORIES } from "@/config/catalog";

const CATEGORY_ENUM = z.enum(
  PRODUCT_CATEGORIES as [string, ...string[]],
) as unknown as z.ZodEnum<Record<string, string>>;

const listField = (value: FormDataEntryValue | null): string[] =>
  String(value ?? "")
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Le nom est obligatoire").max(160),
  brand: z.string().trim().max(80).optional(),
  category: CATEGORY_ENUM,
  subCategory: z.string().trim().max(80).optional(),
  reference: z.string().trim().max(60).optional(),
  ean: z.string().trim().max(20).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  description: z.string().trim().max(1000).optional(),
  purchasePrice: z.string().trim().optional(),
  salePrice: z.string().trim().optional(),
  vatRate: z.coerce.number().min(0).max(30).default(20),
  quantity: z.coerce.number().int().min(0).max(999999).default(0),
  alertThreshold: z.coerce.number().int().min(0).max(9999).default(5),
  location: z.string().trim().max(60).optional(),
  isActive: z.union([z.literal("on"), z.literal("true"), z.literal("false")]).optional(),
});

export async function saveProductAction(
  _previous: ActionResult<{ productId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ productId: string }>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_MANAGE);
  const scope = session.scope;

  const parsed = productSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const input = parsed.data;
  const purchasePriceCents = input.purchasePrice
    ? parseAmountToCents(input.purchasePrice)
    : 0;
  const salePriceCents = input.salePrice ? parseAmountToCents(input.salePrice) : 0;

  if (purchasePriceCents === null || salePriceCents === null) {
    return fail("Prix invalide.", { salePrice: "Utilisez le format 12,90" });
  }

  const commercialClaims = listField(formData.get("commercialClaims"));
  const precautions = listField(formData.get("precautions"));
  const matchingTags = listField(formData.get("matchingTags"));
  const contraindications = listField(formData.get("contraindications"));

  const data = {
    name: input.name,
    brand: input.brand || null,
    category: input.category as never,
    subCategory: input.subCategory || null,
    ean: input.ean || null,
    imageUrl: input.imageUrl || null,
    description: input.description || null,
    commercialClaims,
    precautions,
    matchingTags,
    contraindications,
    purchasePriceCents,
    salePriceCents,
    vatRate: input.vatRate,
    isActive: input.isActive !== "false",
  };

  if (input.id) {
    const existing = await prisma.product.findUnique({
      where: { id: input.id },
      select: { pharmacyId: true },
    });
    if (!existing || existing.pharmacyId !== scope.pharmacyId) {
      return fail("Produit introuvable dans cette officine.");
    }

    await prisma.product.update({ where: { id: input.id }, data });
    await prisma.stockItem.upsert({
      where: { productId: input.id },
      create: {
        pharmacyId: scope.pharmacyId,
        productId: input.id,
        quantity: input.quantity,
        alertThreshold: input.alertThreshold,
        location: input.location || null,
      },
      update: {
        alertThreshold: input.alertThreshold,
        location: input.location || null,
      },
    });

    await recordAudit({
      action: "product.updated",
      entityType: "Product",
      entityId: input.id,
      pharmacyId: scope.pharmacyId,
      userId: scope.userId,
    });

    revalidatePath(`/stock/${input.id}`);
    revalidatePath("/stock");
    return ok({ productId: input.id }, "Produit mis à jour.");
  }

  const reference =
    input.reference || (await nextReference("product", scope.pharmacyId));

  const duplicate = await prisma.product.findFirst({
    where: { pharmacyId: scope.pharmacyId, reference },
    select: { id: true },
  });
  if (duplicate) {
    return fail("Cette référence existe déjà.", { reference: "Référence déjà utilisée" });
  }

  const product = await prisma.product.create({
    data: {
      ...data,
      pharmacyId: scope.pharmacyId,
      organizationId: scope.organizationId,
      reference,
      isDemo: isDemoMode(),
      stockItem: {
        create: {
          pharmacyId: scope.pharmacyId,
          quantity: input.quantity,
          alertThreshold: input.alertThreshold,
          location: input.location || null,
        },
      },
    },
  });

  await recordAudit({
    action: "product.created",
    entityType: "Product",
    entityId: product.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { reference },
  });

  await refreshStockNotifications(scope.pharmacyId);
  revalidatePath("/stock");
  return ok({ productId: product.id }, "Produit créé.");
}

const stockSchema = z.object({
  productId: z.string().min(1),
  mode: z.enum(["ADJUSTMENT", "INVENTORY", "PURCHASE", "LOSS", "RETURN"]),
  quantity: z.coerce.number().int().min(-99999).max(99999),
  reason: z.string().trim().max(200).optional(),
});

export async function adjustStockAction(
  _previous: ActionResult<{ quantityAfter: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ quantityAfter: number }>> {
  const session = await requirePermission(PERMISSIONS.STOCK_ADJUST);
  const parsed = stockSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return fail("Vérifiez la quantité saisie.", zodFieldErrors(parsed.error.issues));
  }

  const { productId, mode, quantity, reason } = parsed.data;

  const result = await applyStockMovement({
    scope: session.scope,
    productId,
    quantityDelta: mode === "LOSS" ? -Math.abs(quantity) : quantity,
    type: mode,
    reason: reason ?? null,
  }).catch((error: Error) => {
    console.error("[stock] ajustement impossible", error);
    return null;
  });

  if (!result) return fail("Ajustement impossible : produit introuvable dans cette officine.");

  await recordAudit({
    action: "stock.adjusted",
    entityType: "Product",
    entityId: productId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { mode, quantity, quantityAfter: result.quantityAfter },
  });

  await refreshStockNotifications(session.scope.pharmacyId);
  revalidatePath("/stock");
  revalidatePath(`/stock/${productId}`);
  return ok(result, `Stock mis à jour : ${result.quantityAfter} unité(s).`);
}

export async function deleteProductAction(productId: string): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_MANAGE);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { pharmacyId: true, name: true },
  });
  if (!product || product.pharmacyId !== session.scope.pharmacyId) {
    return fail("Produit introuvable dans cette officine.");
  }

  // Suppression logique : l'historique des ventes et des conseils reste lisible.
  await prisma.product.update({
    where: { id: productId },
    data: { deletedAt: new Date(), isActive: false },
  });

  await recordAudit({
    action: "product.deleted",
    entityType: "Product",
    entityId: productId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { name: product.name },
  });

  revalidatePath("/stock");
  return ok(null, "Produit retiré du catalogue.");
}

/**
 * Import CSV du catalogue.
 *
 * Format attendu (en-tête obligatoire) :
 * nom;marque;categorie;sous_categorie;reference;ean;prix_achat;prix_vente;tva;quantite;seuil_alerte;description
 */
export async function importProductsAction(
  _previous: ActionResult<{ created: number; updated: number; errors: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ created: number; updated: number; errors: number }>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const scope = session.scope;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Sélectionnez un fichier CSV.");
  }
  if (file.size > 5 * 1024 * 1024) {
    return fail("Le fichier dépasse 5 Mo.");
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return fail("Le fichier ne contient aucune ligne exploitable.");
  }

  const job = await prisma.importJob.create({
    data: {
      pharmacyId: scope.pharmacyId,
      kind: "PRODUCTS",
      status: "RUNNING",
      fileName: file.name,
      totalRows: rows.length,
      userId: scope.userId,
    },
  });

  let created = 0;
  let updated = 0;
  const errors: { line: number; message: string }[] = [];
  const validCategories = new Set(PRODUCT_CATEGORIES);

  for (const [index, row] of rows.entries()) {
    const lineNumber = index + 2;
    try {
      const name = row.nom?.trim();
      if (!name) {
        errors.push({ line: lineNumber, message: "Nom manquant" });
        continue;
      }

      const category = (row.categorie ?? "AUTRE").trim().toUpperCase();
      if (!validCategories.has(category as never)) {
        errors.push({
          line: lineNumber,
          message: `Catégorie inconnue « ${category} »`,
        });
        continue;
      }

      const reference =
        row.reference?.trim() || (await nextReference("product", scope.pharmacyId));
      const purchasePriceCents = parseAmountToCents(row.prix_achat ?? "0") ?? 0;
      const salePriceCents = parseAmountToCents(row.prix_vente ?? "0") ?? 0;
      const quantity = Number.parseInt(row.quantite ?? "0", 10) || 0;
      const alertThreshold = Number.parseInt(row.seuil_alerte ?? "5", 10) || 5;

      const existing = await prisma.product.findFirst({
        where: { pharmacyId: scope.pharmacyId, reference },
        select: { id: true },
      });

      const payload = {
        name,
        brand: row.marque?.trim() || null,
        category: category as never,
        subCategory: row.sous_categorie?.trim() || null,
        ean: row.ean?.trim() || null,
        description: row.description?.trim() || null,
        purchasePriceCents,
        salePriceCents,
        vatRate: Number.parseFloat((row.tva ?? "20").replace(",", ".")) || 20,
      };

      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data: payload });
        await prisma.stockItem.upsert({
          where: { productId: existing.id },
          create: {
            pharmacyId: scope.pharmacyId,
            productId: existing.id,
            quantity,
            alertThreshold,
          },
          update: { quantity, alertThreshold },
        });
        updated += 1;
      } else {
        await prisma.product.create({
          data: {
            ...payload,
            pharmacyId: scope.pharmacyId,
            organizationId: scope.organizationId,
            reference,
            isDemo: isDemoMode(),
            stockItem: {
              create: { pharmacyId: scope.pharmacyId, quantity, alertThreshold },
            },
          },
        });
        created += 1;
      }
    } catch (error) {
      errors.push({
        line: lineNumber,
        message: error instanceof Error ? error.message : "Erreur inconnue",
      });
    }
  }

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: errors.length === rows.length ? "FAILED" : "COMPLETED",
      createdRows: created,
      updatedRows: updated,
      errorRows: errors.length,
      errors: errors.slice(0, 100) as never,
      finishedAt: new Date(),
    },
  });

  await createNotification({
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    type: errors.length === rows.length ? "IMPORT_FAILED" : "IMPORT_COMPLETED",
    severity: errors.length > 0 ? "WARNING" : "SUCCESS",
    title: "Import du catalogue terminé",
    body: `${created} création(s), ${updated} mise(s) à jour, ${errors.length} erreur(s) sur ${rows.length} ligne(s).`,
    linkUrl: "/stock?onglet=catalogue",
  });

  await recordAudit({
    action: "product.imported",
    entityType: "ImportJob",
    entityId: job.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { created, updated, errors: errors.length, total: rows.length },
  });

  await refreshStockNotifications(scope.pharmacyId);
  revalidatePath("/stock");

  return ok(
    { created, updated, errors: errors.length },
    `${created} produit(s) créé(s), ${updated} mis à jour, ${errors.length} erreur(s).`,
  );
}

/** Analyseur CSV minimal : séparateur `;` ou `,`, guillemets échappés. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0)
    ? ";"
    : ",";

  const splitLine = (line: string): string[] => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);
    return values.map((v) => v.trim());
  };

  const headers = splitLine(lines[0]).map((h) =>
    h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, "_"),
  );

  return lines.slice(1).map((line) => {
    const values = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}
