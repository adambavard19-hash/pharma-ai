"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit } from "@/server/audit/log";
import { chunk } from "@/lib/utils";
import { parseBulkStockList, readScannedCode } from "@/core/stock";
import { fail, ok, type ActionResult } from "./types";

/**
 * Le stock médicament de l'officine.
 *
 * Ces actions n'écrivent QUE dans `pharmacy_drug_stocks`. Le catalogue national
 * n'est jamais modifié depuis une officine : une pharmacie déclare ce qu'elle
 * détient, elle ne corrige pas la base publique.
 */

const UPSERT_CHUNK = 500;

const adjustSchema = z.object({
  code: z.string().trim().min(1, "Code manquant"),
  quantity: z.coerce.number().int().min(0).max(999_999),
  alertThreshold: z.coerce.number().int().min(0).max(9_999).default(0),
  location: z.string().trim().max(60).optional(),
});

/** Déclare, met à jour ou complète une ligne de stock à partir d'un code. */
export async function setDrugStockAction(
  _previous: ActionResult<{ cip13: string; quantity: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ cip13: string; quantity: number }>> {
  const session = await requirePermission(PERMISSIONS.STOCK_ADJUST);

  const parsed = adjustSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail("Vérifiez la quantité saisie.");

  const input = parsed.data;
  const scanned = readScannedCode(input.code);
  if (scanned.kind !== "CIP13" && scanned.kind !== "CIP7") {
    return fail("Ce code n'est pas un code CIP de médicament.");
  }

  const presentation = await prisma.drugPresentation.findUnique({
    where: { cip13: scanned.cip13 },
    select: { id: true, cip13: true },
  });
  if (!presentation) {
    return fail(
      "Ce code ne figure pas dans le catalogue national. Vérifiez que le catalogue est à jour dans Paramètres → Moteur.",
    );
  }

  const line = await prisma.pharmacyDrugStock.upsert({
    where: {
      pharmacyId_presentationId: {
        pharmacyId: session.scope.pharmacyId,
        presentationId: presentation.id,
      },
    },
    create: {
      pharmacyId: session.scope.pharmacyId,
      presentationId: presentation.id,
      quantity: input.quantity,
      alertThreshold: input.alertThreshold,
      location: input.location || null,
      source: scanned.kind === "CIP13" ? "SCAN" : "MANUAL",
      lastCountedAt: new Date(),
    },
    update: {
      quantity: input.quantity,
      alertThreshold: input.alertThreshold,
      location: input.location || null,
      lastCountedAt: new Date(),
    },
    select: { id: true, quantity: true },
  });

  await recordAudit({
    action: "drug_stock.adjusted",
    entityType: "pharmacy_drug_stock",
    entityId: line.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.user.id,
    metadata: { cip13: presentation.cip13, quantity: line.quantity },
  });

  revalidatePath("/stock");
  return ok(
    { cip13: presentation.cip13, quantity: line.quantity },
    line.quantity > 0
      ? `Stock mis à jour : ${line.quantity} en rayon.`
      : "Référence conservée, quantité à zéro : elle ne sera pas proposée.",
  );
}

const removeSchema = z.object({ id: z.string().min(1) });

export async function removeDrugStockAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(PERMISSIONS.STOCK_ADJUST);

  const parsed = removeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail("Ligne introuvable.");

  const line = await prisma.pharmacyDrugStock.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, pharmacyId: true, presentation: { select: { cip13: true } } },
  });

  // Re-vérification après lecture : `findUnique` ne connaît pas le tenant.
  if (!line || line.pharmacyId !== session.scope.pharmacyId) {
    return fail("Ligne introuvable.");
  }

  await prisma.pharmacyDrugStock.delete({ where: { id: line.id } });

  await recordAudit({
    action: "drug_stock.removed",
    entityType: "pharmacy_drug_stock",
    entityId: line.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.user.id,
    metadata: { cip13: line.presentation.cip13 },
  });

  revalidatePath("/stock");
  return ok({ id: line.id }, "Référence retirée du stock de l'officine.");
}

export type DrugStockImportReport = {
  /** Lignes lues dans le fichier ou le texte collé. */
  read: number;
  created: number;
  updated: number;
  /** Codes bien formés mais absents du catalogue national. */
  unknown: number;
  /** Lignes illisibles, avec leur numéro et leur motif. */
  rejected: { lineNumber: number; raw: string; reason: string }[];
  duplicates: number;
  /** Lignes valides sans quantité, auxquelles la valeur par défaut s'applique. */
  withoutQuantity: number;
  /** Quantité appliquée à ces lignes. */
  defaultQuantity: number;
};

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const importSchema = z.object({
  /**
   * Quantité appliquée aux lignes sans quantité. Par défaut 0 : un export qui
   * ne dit rien du stock déclare des références, pas des boîtes en rayon.
   */
  defaultQuantity: z.coerce.number().int().min(0).max(999_999).default(0),
});

/**
 * Import en masse d'une liste de codes.
 *
 * C'est la réponse à « je ne vais pas cocher 20 000 médicaments un par un » :
 * l'officine colle ou téléverse l'export de son logiciel de stock, et chaque
 * ligne refusée revient avec son numéro et son motif. Aucun code inconnu du
 * catalogue national n'est créé — une référence inventée serait un médicament
 * inventé.
 */
export async function importDrugStockAction(
  _previous: ActionResult<DrugStockImportReport> | null,
  formData: FormData,
): Promise<ActionResult<DrugStockImportReport>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);

  const parsed = importSchema.safeParse({ defaultQuantity: formData.get("defaultQuantity") });
  if (!parsed.success) return fail("Quantité par défaut invalide.");
  const defaultQuantity = parsed.data.defaultQuantity;

  const file = formData.get("file");
  const pasted = String(formData.get("codes") ?? "");
  let content = pasted;
  let fileName = "collé à l'écran";

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) return fail("Fichier trop volumineux (5 Mo maximum).");
    content = await file.text();
    fileName = file.name;
  }

  if (content.trim().length === 0) {
    return fail("Collez une liste de codes ou choisissez un fichier.");
  }

  const list = parseBulkStockList(content);
  if (list.entries.length === 0) {
    return fail(
      list.rejected.length > 0
        ? `Aucun code exploitable : ${list.rejected.length} ligne(s) refusée(s).`
        : "Aucun code trouvé.",
    );
  }

  const job = await prisma.importJob.create({
    data: {
      pharmacyId: session.scope.pharmacyId,
      kind: "DRUG_STOCK",
      status: "RUNNING",
      fileName,
      totalRows: list.read,
      userId: session.user.id,
    },
    select: { id: true },
  });

  // Résolution des codes contre le catalogue national, par lots : une requête
  // par code coûterait 20 000 allers-retours sur un export d'officine.
  const presentationByCip = new Map<string, string>();
  for (const batch of chunk(list.entries.map((entry) => entry.cip13), 1_000)) {
    const found = await prisma.drugPresentation.findMany({
      where: { cip13: { in: batch } },
      select: { id: true, cip13: true },
    });
    for (const row of found) presentationByCip.set(row.cip13, row.id);
  }

  const known = list.entries.filter((entry) => presentationByCip.has(entry.cip13));
  const unknown = list.entries.length - known.length;

  const existing = new Set<string>();
  for (const batch of chunk(known.map((entry) => presentationByCip.get(entry.cip13)!), 1_000)) {
    const rows = await prisma.pharmacyDrugStock.findMany({
      where: { pharmacyId: session.scope.pharmacyId, presentationId: { in: batch } },
      select: { presentationId: true },
    });
    for (const row of rows) existing.add(row.presentationId);
  }

  const toCreate = known.filter((entry) => !existing.has(presentationByCip.get(entry.cip13)!));
  const toUpdate = known.filter((entry) => existing.has(presentationByCip.get(entry.cip13)!));

  for (const batch of chunk(toCreate, UPSERT_CHUNK)) {
    await prisma.pharmacyDrugStock.createMany({
      data: batch.map((entry) => ({
        pharmacyId: session.scope.pharmacyId,
        presentationId: presentationByCip.get(entry.cip13)!,
        quantity: entry.quantity ?? defaultQuantity,
        source: "IMPORT" as const,
        lastCountedAt: new Date(),
      })),
    });
  }

  for (const entry of toUpdate) {
    await prisma.pharmacyDrugStock.update({
      where: {
        pharmacyId_presentationId: {
          pharmacyId: session.scope.pharmacyId,
          presentationId: presentationByCip.get(entry.cip13)!,
        },
      },
      data: { quantity: entry.quantity ?? defaultQuantity, lastCountedAt: new Date() },
    });
  }

  const report: DrugStockImportReport = {
    read: list.read,
    created: toCreate.length,
    updated: toUpdate.length,
    unknown,
    // Les premières lignes suffisent à corriger un export ; les garder toutes
    // ferait grossir le journal sans rien apprendre de plus.
    rejected: list.rejected.slice(0, 50),
    duplicates: list.duplicates,
    withoutQuantity: list.withoutQuantity,
    defaultQuantity,
  };

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: "COMPLETED",
      createdRows: report.created,
      updatedRows: report.updated,
      errorRows: list.rejected.length + unknown,
      errors: report.rejected as never,
      finishedAt: new Date(),
    },
  });

  await recordAudit({
    action: "drug_stock.imported",
    entityType: "import_job",
    entityId: job.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.user.id,
    metadata: {
      created: report.created,
      updated: report.updated,
      unknown: report.unknown,
      rejected: list.rejected.length,
    },
  });

  revalidatePath("/stock");
  return ok(
    report,
    `${report.created} référence(s) ajoutée(s), ${report.updated} mise(s) à jour.`,
  );
}
