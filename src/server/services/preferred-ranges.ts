import "server-only";
import { cache } from "react";
import { prisma } from "@/server/db/client";
import { brandKey, brandLabelOf, productMatchesBrand } from "@/core/catalog/brand";
import { isUniverseKey } from "@/config/universes";

/**
 * Gammes privilégiées par univers.
 *
 * Le titulaire indique, univers par univers, les laboratoires et gammes qu'il
 * préfère proposer. Le moteur ne s'en sert QUE pour départager des références
 * qu'il juge déjà également pertinentes et sûres pour le patient (voir
 * src/core/catalog/preferred-ranges.ts) : la remise négociée et les notes
 * restent ici, pour mémoire, et n'y entrent jamais. Le moteur ne lit pas ce
 * service : il charge les seules gammes actives, sans remise ni notes, par
 * `loadPreferredRanges` (src/server/services/catalog.ts).
 *
 * Isolation : chaque fonction reçoit la portée de la session et filtre TOUTES
 * ses requêtes par `scope.pharmacyId`. Un identifiant venu du client (gamme ou
 * produit) est revérifié dans l'officine avant toute écriture.
 */

export type RangeScope = { pharmacyId: string; userId: string };

export type PreferredRangeRow = {
  id: string;
  universe: string;
  laboratory: string;
  brandKey: string;
  rangeName: string | null;
  isActive: boolean;
  priority: number;
  /** Remise ou marge négociée, en %. Pour mémoire : n'influence jamais le conseil. */
  discountPercent: number | null;
  notes: string | null;
  /** Produits explicitement concernés encore présents dans l'officine. Vide : toute la marque. */
  products: { id: string; name: string }[];
  /** Produits choisis qui ont depuis quitté le stock (supprimés ou désactivés). */
  missingProducts: number;
  /** Références de l'officine reconnues comme de cette marque (« toute la marque »). */
  brandReferences: number;
  updatedAt: string;
};

export type BrandSuggestion = {
  /** La marque telle qu'elle figure dans le stock, en majuscules. */
  label: string;
  key: string;
  references: number;
  inStock: number;
};

export type BrandProduct = { id: string; name: string; quantity: number };

export type PreferredRangeSaveInput = {
  id?: string | null;
  universe: string;
  laboratory: string;
  rangeName?: string | null;
  isActive: boolean;
  priority: number;
  discountPercent?: number | null;
  notes?: string | null;
  /** Vide : toute la marque. */
  productIds: string[];
};

export type RangeServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; field?: string };

/** Les produits actifs de l'officine, lus une fois par requête (la page en a besoin deux fois). */
const activeProductsOf = cache(async (pharmacyId: string) =>
  prisma.product.findMany({
    where: { pharmacyId, deletedAt: null, isActive: true },
    select: { id: true, name: true, brand: true, stockItem: { select: { quantity: true } } },
  }),
);

function decimalToNumber(value: { toString(): string } | null): number | null {
  if (value === null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

/** Toutes les gammes de l'officine, triées par univers puis priorité. */
export async function listPreferredRanges(scope: RangeScope): Promise<PreferredRangeRow[]> {
  const ranges = await prisma.preferredRange.findMany({
    where: { pharmacyId: scope.pharmacyId },
    orderBy: [{ universe: "asc" }, { priority: "asc" }, { laboratory: "asc" }],
  });
  if (ranges.length === 0) return [];

  const products = await activeProductsOf(scope.pharmacyId);
  const nameById = new Map(products.map((product) => [product.id, product.name]));

  // « Toute la marque » : le même critère que le moteur (productMatchesBrand),
  // calculé une fois par marque et non une fois par gamme.
  const brandCounts = new Map<string, number>();
  for (const key of new Set(ranges.map((range) => range.brandKey))) {
    brandCounts.set(key, products.filter((product) => productMatchesBrand(product, key)).length);
  }

  return ranges.map((range) => {
    const present = range.productIds.filter((id) => nameById.has(id));
    return {
      id: range.id,
      universe: range.universe,
      laboratory: range.laboratory,
      brandKey: range.brandKey,
      rangeName: range.rangeName,
      isActive: range.isActive,
      priority: range.priority,
      discountPercent: decimalToNumber(range.discountPercent),
      notes: range.notes,
      products: present.map((id) => ({ id, name: nameById.get(id) ?? "" })).sort((a, b) => a.name.localeCompare(b.name, "fr")),
      missingProducts: range.productIds.length - present.length,
      brandReferences: brandCounts.get(range.brandKey) ?? 0,
      updatedAt: range.updatedAt.toISOString(),
    };
  });
}

/**
 * Les marques du stock de l'officine, avec leur nombre de références : le
 * titulaire choisit dans ce qu'il a, il ne tape pas de mémoire. Même lecture
 * de la marque que l'écran « Laboratoires » (brandLabelOf).
 */
export async function brandSuggestions(scope: RangeScope): Promise<BrandSuggestion[]> {
  const products = await activeProductsOf(scope.pharmacyId);
  const byLabel = new Map<string, BrandSuggestion>();
  for (const product of products) {
    const label = brandLabelOf(product.name, product.brand);
    if (!label) continue;
    const entry = byLabel.get(label) ?? { label, key: brandKey(label), references: 0, inStock: 0 };
    entry.references += 1;
    if ((product.stockItem?.quantity ?? 0) > 0) entry.inStock += 1;
    byLabel.set(label, entry);
  }
  return [...byLabel.values()].sort((a, b) => b.references - a.references || a.label.localeCompare(b.label, "fr"));
}

/** Les produits de l'officine reconnus comme de cette marque, pour choisir les « produits concernés ». */
export async function productsOfBrand(scope: RangeScope, key: string): Promise<BrandProduct[]> {
  const normalized = brandKey(key);
  if (!normalized) return [];
  const products = await activeProductsOf(scope.pharmacyId);
  return products
    .filter((product) => productMatchesBrand(product, normalized))
    .map((product) => ({ id: product.id, name: product.name, quantity: product.stockItem?.quantity ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .slice(0, 500);
}

/** Crée ou met à jour une gamme. Les produits choisis sont revérifiés dans l'officine. */
export async function savePreferredRange(
  scope: RangeScope,
  input: PreferredRangeSaveInput,
): Promise<RangeServiceResult<{ id: string; created: boolean; brandKey: string }>> {
  if (!isUniverseKey(input.universe)) return { ok: false, error: "Choisissez un univers.", field: "universe" };
  const laboratory = input.laboratory.trim();
  const key = brandKey(laboratory);
  if (!key) return { ok: false, error: "Indiquez le laboratoire ou la marque.", field: "laboratory" };
  const rangeName = input.rangeName?.trim() || null;

  let existingId: string | null = null;
  if (input.id) {
    const existing = await prisma.preferredRange.findFirst({
      where: { id: input.id, pharmacyId: scope.pharmacyId },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "Gamme introuvable dans cette officine." };
    existingId = existing.id;
  }

  // Pas de doublon : une même marque (et gamme) une seule fois par univers.
  const siblings = await prisma.preferredRange.findMany({
    where: { pharmacyId: scope.pharmacyId, universe: input.universe, brandKey: key },
    select: { id: true, rangeName: true },
  });
  const rangeKey = brandKey(rangeName ?? "");
  if (siblings.some((sibling) => sibling.id !== existingId && brandKey(sibling.rangeName ?? "") === rangeKey)) {
    return {
      ok: false,
      error: rangeName ? "Cette gamme est déjà enregistrée dans cet univers." : "Cette marque est déjà enregistrée dans cet univers.",
      field: rangeName ? "rangeName" : "laboratory",
    };
  }

  const productIds = [...new Set(input.productIds)];
  if (productIds.length > 0) {
    const owned = await prisma.product.findMany({
      where: { id: { in: productIds }, pharmacyId: scope.pharmacyId, deletedAt: null },
      select: { id: true },
    });
    if (owned.length !== productIds.length) {
      return { ok: false, error: "Un produit choisi est introuvable dans cette officine.", field: "productIds" };
    }
  }

  const data = {
    universe: input.universe,
    laboratory,
    brandKey: key,
    rangeName,
    isActive: input.isActive,
    priority: Math.max(1, Math.round(input.priority)),
    discountPercent: input.discountPercent ?? null,
    notes: input.notes?.trim() || null,
    productIds,
  };

  if (existingId) {
    // updateMany sur { id, pharmacyId } : l'écriture elle-même reste bornée à l'officine.
    await prisma.preferredRange.updateMany({ where: { id: existingId, pharmacyId: scope.pharmacyId }, data });
    return { ok: true, data: { id: existingId, created: false, brandKey: key } };
  }
  const created = await prisma.preferredRange.create({
    data: { ...data, pharmacyId: scope.pharmacyId, createdByUserId: scope.userId },
    select: { id: true },
  });
  return { ok: true, data: { id: created.id, created: true, brandKey: key } };
}

/** Active ou désactive une gamme en un geste. */
export async function setPreferredRangeActive(
  scope: RangeScope,
  id: string,
  isActive: boolean,
): Promise<RangeServiceResult<{ id: string; laboratory: string; universe: string }>> {
  const range = await prisma.preferredRange.findFirst({
    where: { id, pharmacyId: scope.pharmacyId },
    select: { id: true, laboratory: true, universe: true },
  });
  if (!range) return { ok: false, error: "Gamme introuvable dans cette officine." };
  await prisma.preferredRange.updateMany({ where: { id: range.id, pharmacyId: scope.pharmacyId }, data: { isActive } });
  return { ok: true, data: range };
}

/** Supprime une gamme de l'officine. */
export async function deletePreferredRange(
  scope: RangeScope,
  id: string,
): Promise<RangeServiceResult<{ id: string; laboratory: string; universe: string }>> {
  const range = await prisma.preferredRange.findFirst({
    where: { id, pharmacyId: scope.pharmacyId },
    select: { id: true, laboratory: true, universe: true },
  });
  if (!range) return { ok: false, error: "Gamme introuvable dans cette officine." };
  await prisma.preferredRange.deleteMany({ where: { id: range.id, pharmacyId: scope.pharmacyId } });
  return { ok: true, data: range };
}

