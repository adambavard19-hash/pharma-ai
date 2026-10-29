import "server-only";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { MODULES_SETTING_KEY, productModule, readModules, type AdviceModuleCode } from "@/core/ai/advice-modules";

/**
 * Les modules de conseil d'une pharmacie (fondateur, 29 oct. 2026), gardés dans SES paramètres (`Pharmacy.settings.modules`) :
 * pas de table de plus. Le titulaire les choisit dans « Mes modules » ; l'équipe PharmaBoost peut les régler depuis la console.
 */

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function loadAdviceModules(pharmacyId: string): Promise<AdviceModuleCode[]> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { settings: true } });
  return readModules(asObject(pharmacy?.settings)[MODULES_SETTING_KEY]);
}

export type ModulesActor = { userId: string } | { platformAdminId: string };

export async function saveAdviceModules(pharmacyId: string, codes: unknown, actor: ModulesActor): Promise<{ ok: true; modules: AdviceModuleCode[] } | { ok: false; error: string }> {
  const modules = readModules(codes);
  const current = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { settings: true } });
  if (!current) return { ok: false, error: "Pharmacie introuvable." };
  const settings = { ...asObject(current.settings), [MODULES_SETTING_KEY]: modules };
  await prisma.pharmacy.update({ where: { id: pharmacyId }, data: { settings: settings as Prisma.InputJsonValue } });
  await recordAudit({
    action: "advice.modules_saved",
    entityType: "Pharmacy",
    entityId: pharmacyId,
    pharmacyId,
    userId: "userId" in actor ? actor.userId : null,
    ...("platformAdminId" in actor ? { platformAdminId: actor.platformAdminId } : {}),
    metadata: { modules },
  });
  return { ok: true, modules };
}

/** Pour la console : chaque pharmacie et ses modules. */
export async function listPharmacyModules(): Promise<{ id: string; name: string; city: string | null; modules: AdviceModuleCode[]; isDemo: boolean }[]> {
  const rows = await prisma.pharmacy.findMany({ select: { id: true, name: true, city: true, isDemo: true, settings: true }, orderBy: { name: "asc" } });
  return rows.map((row) => ({ id: row.id, name: row.name, city: row.city, isDemo: row.isDemo, modules: readModules(asObject(row.settings)[MODULES_SETTING_KEY]) }));
}

/** Combien de produits du stock de la pharmacie tombent dans chaque module : ce que le choix change vraiment. */
export async function stockModuleCounts(pharmacyId: string): Promise<Partial<Record<AdviceModuleCode, number>>> {
  const products = await prisma.product.findMany({ where: { pharmacyId, isActive: true, deletedAt: null }, select: { name: true, brand: true, category: true, ean: true } });
  const counts: Partial<Record<AdviceModuleCode, number>> = {};
  for (const product of products) {
    const code = productModule(product);
    if (code) counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}
