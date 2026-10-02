import "server-only";
import { prisma } from "@/server/db/client";
import { isVigilancePopulation, type VigilanceLevel } from "@/config/vigilances";

/**
 * Les vigilances patient qu'une officine déclare sur ses produits.
 *
 * C'est le pharmacien qui les écrit, à partir de la notice ou de sa pratique :
 * PharmaBoost n'en invente aucune. Le moteur les lit (catalog.ts) : une
 * contre-indication écarte la référence quand le patient est concerné, les
 * autres niveaux s'affichent sur la carte de conseil.
 */

export type VigilanceScope = { pharmacyId: string; userId: string };

export type DeclaredVigilance = { id: string; population: string; level: VigilanceLevel; note: string | null; updatedAt: Date };

export async function listProductVigilances(scope: VigilanceScope, productId: string): Promise<DeclaredVigilance[]> {
  return prisma.productVigilance.findMany({
    where: { pharmacyId: scope.pharmacyId, productId },
    select: { id: true, population: true, level: true, note: true, updatedAt: true },
    orderBy: { population: "asc" },
  });
}

export async function saveProductVigilance(
  scope: VigilanceScope,
  input: { productId: string; population: string; level: VigilanceLevel; note: string | null },
): Promise<{ ok: true; id: string; productName: string } | { ok: false; error: string }> {
  if (!isVigilancePopulation(input.population)) return { ok: false, error: "Population inconnue." };
  const product = await prisma.product.findFirst({ where: { id: input.productId, pharmacyId: scope.pharmacyId, deletedAt: null }, select: { id: true, name: true } });
  if (!product) return { ok: false, error: "Produit introuvable dans cette officine." };
  const saved = await prisma.productVigilance.upsert({
    where: { productId_population: { productId: product.id, population: input.population } },
    create: { pharmacyId: scope.pharmacyId, productId: product.id, population: input.population, level: input.level, note: input.note, createdByUserId: scope.userId },
    update: { level: input.level, note: input.note },
    select: { id: true, pharmacyId: true },
  });
  // Défense en profondeur : l'unicité porte sur le produit, déjà vérifié dans l'officine.
  if (saved.pharmacyId !== scope.pharmacyId) return { ok: false, error: "Produit introuvable dans cette officine." };
  return { ok: true, id: saved.id, productName: product.name };
}

export async function deleteProductVigilance(scope: VigilanceScope, id: string): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  const existing = await prisma.productVigilance.findFirst({ where: { id, pharmacyId: scope.pharmacyId }, select: { id: true, productId: true } });
  if (!existing) return { ok: false, error: "Vigilance introuvable dans cette officine." };
  await prisma.productVigilance.delete({ where: { id: existing.id } });
  return { ok: true, productId: existing.productId };
}
