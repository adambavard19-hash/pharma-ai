import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";
import type { UnderstandingLine } from "@/core/understanding";
import { classifyPharmacyProducts, type ClassificationRunSummary } from "@/server/services/product-classification";
import { classificationKey, ensureClassifications } from "@/server/services/classification";

/**
 * « Connaître le stock par cœur » : dès qu'une pharmacie envoie son stock, et chaque nuit pour ce qui reste, PharmaBoost range chaque
 * produit (dictionnaire, puis modèle) et classe chaque médicament en stock (substance, famille, code ATC) AVANT qu'on en ait besoin.
 * Au comptoir, tout est alors déjà compris : l'analyse est locale et immédiate.
 *
 * Ce qui reste incompris est inscrit dans le carnet « Produits à connaître » de la console super admin (jamais chez le titulaire),
 * où la pharmacienne de PharmaBoost répond une fois pour toutes les pharmacies.
 */

const MEDICINE_BATCH = 30;

export type MedicineLearning = { inStock: number; alreadyKnown: number; processed: number; remaining: number };

/** Classe les médicaments du stock que la mémoire commune ne connaît pas encore, par lots bornés. */
export async function learnStockMedicines(scope: TenantScope, options: { maxBatches?: number; deadlineAt?: number } = {}): Promise<MedicineLearning> {
  const rows = await prisma.pharmacyDrugStock.findMany({
    where: { pharmacyId: scope.pharmacyId },
    select: { presentation: { select: { specialty: { select: { id: true, name: true, pharmaceuticalForm: true, compositions: { where: { nature: "SA" }, select: { substanceLabel: true } } } } } } },
  });
  const specialties = new Map<string, { name: string; form: string | null; substances: string[] }>();
  for (const row of rows) {
    const specialty = row.presentation.specialty;
    if (!specialties.has(specialty.id)) specialties.set(specialty.id, { name: specialty.name, form: specialty.pharmaceuticalForm, substances: [...new Set(specialty.compositions.map((c) => c.substanceLabel))] });
  }
  const byKey = new Map<string, { name: string; form: string | null; substances: string[] }>();
  for (const specialty of specialties.values()) {
    const key = classificationKey(specialty.name);
    if (key && !byKey.has(key)) byKey.set(key, specialty);
  }
  const known = new Set<string>();
  const keys = [...byKey.keys()];
  for (let i = 0; i < keys.length; i += 1000) {
    const found = await prisma.drugClassification.findMany({ where: { key: { in: keys.slice(i, i + 1000) } }, select: { key: true } });
    for (const row of found) known.add(row.key);
  }
  const todo = keys.filter((key) => !known.has(key));
  const limit = (options.maxBatches ?? 20) * MEDICINE_BATCH;
  const batch = todo.slice(0, limit);
  const deadlineAt = options.deadlineAt ?? Number.POSITIVE_INFINITY;
  let done = 0;
  for (let i = 0; i < batch.length; i += MEDICINE_BATCH) {
    if (Date.now() >= deadlineAt) break;
    done = Math.min(batch.length, i + MEDICINE_BATCH);
    const lines: UnderstandingLine[] = batch.slice(i, i + MEDICINE_BATCH).map((key, index) => {
      const specialty = byKey.get(key)!;
      return { lineIndex: index, drugName: specialty.name, dosage: null, form: specialty.form, posology: null, durationDays: null, officialName: specialty.name, officialSubstances: specialty.substances };
    });
    // Un lot qui échoue (modèle indisponible) n'arrête pas la suite : le passage de nuit reprendra ce qui manque.
    await ensureClassifications({ scope, lines }).catch((error) => console.error("[stock-learning] médicaments", error));
  }
  return { inStock: byKey.size, alreadyKnown: byKey.size - todo.length, processed: done, remaining: todo.length - done };
}

export type StockLearning = { products: ClassificationRunSummary; medicines: MedicineLearning };

export async function learnPharmacyStock(scope: TenantScope, options: { maxProductBatches?: number; maxMedicineBatches?: number; deadlineAt?: number } = {}): Promise<StockLearning> {
  const products = await classifyPharmacyProducts({ scope, maxAiBatches: options.maxProductBatches ?? 60, deadlineAt: options.deadlineAt });
  const medicines = await learnStockMedicines(scope, { maxBatches: options.maxMedicineBatches ?? 20, deadlineAt: options.deadlineAt });
  return { products, medicines };
}

/** Reste-t-il du travail pour cette pharmacie ? (produits pas encore rangés, médicaments pas encore classés.) */
export const hasBacklog = (result: StockLearning): boolean => result.products.remaining > 0 || result.medicines.remaining > 0;

export type LearningPass = { pharmacies: number; processed: number; skipped: number; moreToDo: boolean };

/**
 * Un passage de connaissance du stock, borné dans le temps : les pharmacies qui ont le plus de retard d'abord, une échéance
 * (`deadlineAt`) qu'on ne dépasse pas — on n'entame pas un lot qu'on ne peut pas finir. `moreToDo` dit s'il faut un autre passage
 * (lots restants, ou pharmacies pas encore vues) : l'appelant s'en charge, la fonction ne rappelle personne.
 */
export async function runStockLearningPass(options: { deadlineAt: number; pharmacyId?: string }): Promise<LearningPass> {
  const pharmacies = await prisma.pharmacy.findMany({
    where: { isActive: true, isDemo: false, ...(options.pharmacyId ? { id: options.pharmacyId } : {}) },
    select: { id: true, organizationId: true, memberships: { where: { role: "OWNER", isActive: true }, take: 1, select: { userId: true } } },
  });
  const backlog = await prisma.product.groupBy({ by: ["pharmacyId"], where: { deletedAt: null, classifiedAt: null }, _count: true });
  const waiting = new Map(backlog.map((row) => [row.pharmacyId, row._count]));
  pharmacies.sort((a, b) => (waiting.get(b.id) ?? 0) - (waiting.get(a.id) ?? 0));

  const pass: LearningPass = { pharmacies: pharmacies.length, processed: 0, skipped: 0, moreToDo: false };
  for (const pharmacy of pharmacies) {
    const owner = pharmacy.memberships[0];
    if (!owner) { pass.skipped += 1; continue; }
    if (Date.now() >= options.deadlineAt) { pass.skipped += 1; pass.moreToDo = true; continue; }
    try {
      const result = await learnPharmacyStock({ pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, userId: owner.userId }, { maxProductBatches: 200, maxMedicineBatches: 200, deadlineAt: options.deadlineAt });
      pass.processed += 1;
      if (hasBacklog(result)) pass.moreToDo = true;
    } catch (error) {
      console.error("[stock-learning] passage", pharmacy.id, error instanceof Error ? error.message : error);
      pass.skipped += 1;
    }
  }
  return pass;
}

