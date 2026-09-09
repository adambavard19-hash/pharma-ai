"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import {
  IMPORT_MAX_BYTES,
  analyseStockImport,
  commitStockImport,
  remapStockImport,
  type ImportOutcome,
  type ImportPreview,
} from "@/server/services/stock-import";
import { fail, ok, type ActionResult } from "./types";

/**
 * L'import du stock : analyser, corriger les colonnes, valider.
 *
 * Réservé au titulaire (`PRODUCT_IMPORT`). Rien n'est écrit en stock avant la
 * validation explicite de l'aperçu.
 */

export async function analyseStockImportAction(formData: FormData): Promise<ActionResult<ImportPreview>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choisissez un fichier CSV ou Excel.");
  if (file.size > IMPORT_MAX_BYTES) return fail("Le fichier dépasse 8 Mo.");
  const lower = file.name.toLowerCase();
  if (!/\.(csv|txt|xlsx|xls)$/.test(lower)) return fail("Format accepté : CSV ou Excel (.xlsx).");

  try {
    const preview = await analyseStockImport({
      scope: session.scope,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return ok(preview);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Le fichier n'a pas pu être analysé.");
  }
}

const mappingSchema = z.object({
  jobId: z.string().min(1),
  mapping: z.object({
    name: z.string().optional(),
    code: z.string().optional(),
    quantity: z.string().optional(),
    salePrice: z.string().optional(),
    purchasePrice: z.string().optional(),
    vatRate: z.string().optional(),
    brand: z.string().optional(),
    category: z.string().optional(),
  }),
});

export async function remapStockImportAction(
  payload: z.input<typeof mappingSchema>,
): Promise<ActionResult<ImportPreview>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const parsed = mappingSchema.safeParse(payload);
  if (!parsed.success) return fail("Correspondance de colonnes invalide.");
  try {
    const mapping = Object.fromEntries(
      Object.entries(parsed.data.mapping).filter(([, value]) => Boolean(value)),
    );
    return ok(await remapStockImport({ scope: session.scope, jobId: parsed.data.jobId, mapping }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Réanalyse impossible.");
  }
}

const decisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CREER_PRODUIT") }),
  z.object({ kind: z.literal("RATTACHER"), targetId: z.string().min(1) }),
  z.object({ kind: z.literal("IGNORER") }),
]);

const commitSchema = z.object({
  jobId: z.string().min(1),
  decisions: z.record(z.string(), decisionSchema).default({}),
  createUnknownByDefault: z.boolean().default(false),
});

export async function commitStockImportAction(
  payload: z.input<typeof commitSchema>,
): Promise<ActionResult<ImportOutcome>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const parsed = commitSchema.safeParse(payload);
  if (!parsed.success) return fail("Décisions invalides.");
  try {
    const outcome = await commitStockImport({
      scope: session.scope,
      pharmacyIsDemo: session.pharmacy.isDemo,
      jobId: parsed.data.jobId,
      decisions: parsed.data.decisions,
      createUnknownByDefault: parsed.data.createUnknownByDefault,
    });
    revalidatePath("/stock");
    revalidatePath("/bienvenue");
    return ok(
      outcome,
      `${outcome.productsCreated} créé(s), ${outcome.productsUpdated + outcome.drugsUpserted} mis à jour, ${outcome.ignored} ignoré(s).`,
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "L'import a échoué : rien n'a été écrit.");
  }
}

/**
 * Relance la classification des produits que le moteur ne sait pas encore
 * relier à un besoin (import ancien, modèle indisponible au moment de
 * l'import…). Bornée : quelques lots par clic, le reste est annoncé.
 */
export async function classifyProductsAction(payload?: { force?: boolean }): Promise<ActionResult<import("@/server/services/product-classification").ClassificationRunSummary>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_MANAGE);
  try {
    const { classifyPharmacyProducts } = await import("@/server/services/product-classification");
    const summary = await classifyPharmacyProducts({ scope: session.scope, force: payload?.force ?? false });
    revalidatePath("/stock");
    const classified = summary.fromCache + summary.byHeuristic + summary.byAi;
    return ok(
      summary,
      summary.considered === 0
        ? "Tous vos produits sont déjà classés."
        : `${classified} produit(s) compris sur ${summary.considered}${summary.remaining > 0 ? ` — ${summary.remaining} restent à classer, relancez.` : ""}.`,
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "La classification a échoué.");
  }
}
