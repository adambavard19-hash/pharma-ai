import "server-only";
import { prisma } from "@/server/db/client";
import type { PublicationStatus } from "@/core/partners/status";
import { parseCatalogCsv, planCatalogImport, type CatalogImportError, type CatalogImportField, type CatalogImportRow } from "@/core/partners/catalog-import";
import type { ServiceResult } from "./brands";

/**
 * Le catalogue d'une marque partenaire, côté console.
 *
 * Sans API partenaire, le catalogue est saisi produit par produit ou importé
 * d'un CSV collé ; la synchronisation automatique attend l'API du partenaire.
 * Le catalogue est central : une seule fiche par produit, lue par les
 * officines qui voient la marque, jamais copiée dans leur stock.
 *
 * Un produit déjà commandé n'est jamais supprimé (les commandes y renvoient) :
 * on le désactive.
 */

export type CatalogBrandOption = { id: string; name: string; partnerName: string; status: PublicationStatus; products: number };

export async function listCatalogBrands(): Promise<CatalogBrandOption[]> {
  const brands = await prisma.partnerBrand.findMany({
    orderBy: [{ partner: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, status: true, partner: { select: { name: true } }, _count: { select: { products: true } } },
  });
  return brands.map((brand) => ({ id: brand.id, name: brand.name, partnerName: brand.partner.name, status: brand.status, products: brand._count.products }));
}

export type CatalogProductRow = {
  id: string;
  name: string;
  rangeId: string | null;
  ean: string | null;
  cip13: string | null;
  packaging: string | null;
  proPriceCents: number | null;
  publicPriceCents: number | null;
  externalRef: string | null;
  isActive: boolean;
  /** Lignes de commande qui renvoient à ce produit : au-delà de zéro, il ne se supprime plus. */
  orderLines: number;
  updatedAt: string;
};

export type ConsoleCatalog = {
  brand: { id: string; name: string; status: PublicationStatus; partner: { id: string; name: string } };
  ranges: { id: string; name: string; status: PublicationStatus }[];
  products: CatalogProductRow[];
};

export async function getConsoleCatalog(brandId: string): Promise<ConsoleCatalog | null> {
  const brand = await prisma.partnerBrand.findFirst({
    where: { id: brandId },
    select: {
      id: true,
      name: true,
      status: true,
      partner: { select: { id: true, name: true } },
      ranges: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, status: true } },
      products: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, rangeId: true, ean: true, cip13: true, packaging: true, proPriceCents: true, publicPriceCents: true, externalRef: true, isActive: true, updatedAt: true },
      },
    },
  });
  if (!brand) return null;
  const ordered = brand.products.length
    ? await prisma.partnerOrderLine.groupBy({ by: ["partnerProductId"], where: { partnerProductId: { in: brand.products.map((product) => product.id) } }, _count: { _all: true } })
    : [];
  const orderLines = new Map(ordered.map((row) => [row.partnerProductId, row._count._all]));
  return {
    brand: { id: brand.id, name: brand.name, status: brand.status, partner: brand.partner },
    ranges: brand.ranges,
    products: brand.products.map((product) => ({ ...product, updatedAt: product.updatedAt.toISOString(), orderLines: orderLines.get(product.id) ?? 0 })),
  };
}

export type ProductInput = {
  name: string;
  rangeId: string | null;
  ean: string | null;
  cip13: string | null;
  packaging: string | null;
  proPriceCents: number | null;
  publicPriceCents: number | null;
  externalRef: string | null;
  isActive: boolean;
};

export async function saveProduct(brandId: string, productId: string | null, input: ProductInput): Promise<ServiceResult<{ id: string; name: string; created: boolean }>> {
  const brand = await prisma.partnerBrand.findFirst({ where: { id: brandId }, select: { id: true, ranges: { select: { id: true } } } });
  if (!brand) return { ok: false, error: "Marque introuvable." };
  if (input.rangeId && !brand.ranges.some((range) => range.id === input.rangeId)) return { ok: false, error: "Cette gamme n'appartient pas à la marque.", field: "rangeId" };
  if (productId) {
    const product = await prisma.partnerProduct.findFirst({ where: { id: productId, brandId: brand.id }, select: { id: true } });
    if (!product) return { ok: false, error: "Produit introuvable." };
  }

  // Un même code ne désigne qu'un produit de la marque.
  const codes: { field: "ean" | "cip13" | "externalRef"; value: string | null; label: string }[] = [
    { field: "ean", value: input.ean, label: "Cet EAN" },
    { field: "cip13", value: input.cip13, label: "Ce CIP13" },
    { field: "externalRef", value: input.externalRef, label: "Cette référence" },
  ];
  for (const code of codes) {
    if (!code.value) continue;
    const match = code.field === "ean" ? { ean: code.value } : code.field === "cip13" ? { cip13: code.value } : { externalRef: code.value };
    const other = await prisma.partnerProduct.findFirst({
      where: { brandId: brand.id, ...match, ...(productId ? { id: { not: productId } } : {}) },
      select: { name: true },
    });
    if (other) return { ok: false, error: `${code.label} est déjà utilisé par « ${other.name} ».`, field: code.field };
  }

  if (productId) {
    const updated = await prisma.partnerProduct.update({ where: { id: productId }, data: input, select: { id: true, name: true } });
    return { ok: true, data: { ...updated, created: false } };
  }
  const created = await prisma.partnerProduct.create({ data: { ...input, brandId: brand.id }, select: { id: true, name: true } });
  return { ok: true, data: { ...created, created: true } };
}

export async function setProductActive(brandId: string, productId: string, isActive: boolean): Promise<ServiceResult<{ name: string }>> {
  const product = await prisma.partnerProduct.findFirst({ where: { id: productId, brandId }, select: { id: true, name: true } });
  if (!product) return { ok: false, error: "Produit introuvable." };
  await prisma.partnerProduct.update({ where: { id: product.id }, data: { isActive } });
  return { ok: true, data: { name: product.name } };
}

/** Suppression définitive, seulement pour un produit jamais commandé. */
export async function deleteProduct(brandId: string, productId: string): Promise<ServiceResult<{ name: string }>> {
  const product = await prisma.partnerProduct.findFirst({ where: { id: productId, brandId }, select: { id: true, name: true } });
  if (!product) return { ok: false, error: "Produit introuvable." };
  const ordered = await prisma.partnerOrderLine.count({ where: { partnerProductId: product.id } });
  if (ordered > 0) return { ok: false, error: `« ${product.name} » figure dans ${ordered} ligne${ordered > 1 ? "s" : ""} de commande : désactivez-le plutôt que de le supprimer.` };
  await prisma.partnerProduct.delete({ where: { id: product.id } });
  return { ok: true, data: { name: product.name } };
}

export type CatalogImportReport = {
  /** Lignes de produit lues (hors en-tête et lignes vides). */
  dataLines: number;
  creates: number;
  updates: number;
  errors: CatalogImportError[];
  ignoredColumns: string[];
  /** Vrai quand les lignes valides ont été écrites (et pas seulement vérifiées). */
  applied: boolean;
};

/** Ce qu'une ligne importée écrit sur un produit existant : les seules colonnes présentes dans le texte collé. */
function updateData(row: CatalogImportRow, columns: CatalogImportField[]) {
  const has = (field: CatalogImportField) => columns.includes(field);
  return {
    name: row.name,
    ...(has("range") ? { rangeId: row.rangeId } : {}),
    ...(has("ean") ? { ean: row.ean } : {}),
    ...(has("cip13") ? { cip13: row.cip13 } : {}),
    ...(has("packaging") ? { packaging: row.packaging } : {}),
    ...(has("proPrice") ? { proPriceCents: row.proPriceCents } : {}),
    ...(has("publicPrice") ? { publicPriceCents: row.publicPriceCents } : {}),
    ...(has("externalRef") ? { externalRef: row.externalRef } : {}),
    ...(has("active") ? { isActive: row.isActive } : {}),
  };
}

/**
 * Vérifie (et, si `apply`, écrit) un catalogue collé. Le texte est relu à
 * chaque appel : ce que le navigateur a affiché comme rapport n'est jamais
 * repris tel quel. Seules les lignes valides sont écrites.
 */
export async function importCatalog(brandId: string, text: string, apply: boolean): Promise<ServiceResult<CatalogImportReport>> {
  const brand = await prisma.partnerBrand.findFirst({
    where: { id: brandId },
    select: { id: true, ranges: { select: { id: true, name: true } }, products: { select: { id: true, ean: true, cip13: true, externalRef: true } } },
  });
  if (!brand) return { ok: false, error: "Marque introuvable." };

  const parsed = parseCatalogCsv(text, brand.ranges);
  const plan = planCatalogImport(parsed.rows, brand.products);
  const errors = [...parsed.errors, ...plan.errors].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  const report: CatalogImportReport = { dataLines: parsed.dataLines, creates: plan.creates.length, updates: plan.updates.length, errors, ignoredColumns: parsed.ignoredColumns, applied: false };
  if (!apply || plan.creates.length + plan.updates.length === 0) return { ok: true, data: report };

  await prisma.$transaction([
    ...(plan.creates.length
      ? [
          prisma.partnerProduct.createMany({
            data: plan.creates.map((row) => ({
              brandId: brand.id,
              name: row.name,
              rangeId: row.rangeId,
              ean: row.ean,
              cip13: row.cip13,
              packaging: row.packaging,
              proPriceCents: row.proPriceCents,
              publicPriceCents: row.publicPriceCents,
              externalRef: row.externalRef,
              isActive: row.isActive,
            })),
          }),
        ]
      : []),
    ...plan.updates.map((update) => prisma.partnerProduct.update({ where: { id: update.id }, data: updateData(update.row, parsed.columns) })),
  ]);
  return { ok: true, data: { ...report, applied: true } };
}
