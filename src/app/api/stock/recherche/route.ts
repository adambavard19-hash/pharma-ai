import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { resolveScannedInput, searchDrugCatalog } from "@/server/services/drug-catalog";

/**
 * Une seule recherche pour ajouter au stock : par nom, par CIP ou par EAN.
 *
 * Les deux catalogues restent séparés en base — national pour les
 * médicaments, celui de l'officine pour la parapharmacie — mais le titulaire
 * ne tape qu'une fois. Chaque résultat dit d'où il vient et ce que l'officine
 * en a déjà.
 */
export type StockSearchHit = {
  kind: "DRUG" | "PRODUCT";
  /** Présentation (médicament) ou produit de l'officine. */
  id: string;
  code: string | null;
  label: string;
  detail: string | null;
  /** Prix connu : celui de l'officine, sinon le prix public. */
  priceCents: number | null;
  /** Quantité déjà en stock dans cette officine, `null` si non suivie. */
  quantity: number | null;
};

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.STOCK_VIEW)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2) return NextResponse.json({ results: [] });

  const pharmacyId = session.scope.pharmacyId;
  const hits: StockSearchHit[] = [];

  const scanned = await resolveScannedInput(pharmacyId, query);
  if (scanned.kind === "DRUG") {
    hits.push(toDrugHit(scanned.result));
  } else if (scanned.kind === "PRODUCT") {
    const product = await prisma.product.findUnique({
      where: { id: scanned.productId },
      select: { id: true, name: true, brand: true, ean: true, salePriceCents: true, stockItem: { select: { quantity: true } } },
    });
    if (product) hits.push(toProductHit(product));
  } else if (scanned.kind === "TEXT") {
    for (const result of scanned.results.slice(0, 6)) hits.push(toDrugHit(result));
  }

  if (scanned.kind === "TEXT" || scanned.kind === "PRODUCT_UNKNOWN") {
    const products = await prisma.product.findMany({
      where: {
        pharmacyId,
        deletedAt: null,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { brand: { contains: query, mode: "insensitive" } },
          { ean: { contains: query } },
        ],
      },
      select: { id: true, name: true, brand: true, ean: true, salePriceCents: true, stockItem: { select: { quantity: true } } },
      orderBy: { name: "asc" },
      take: 8,
    });
    for (const product of products) hits.push(toProductHit(product));
  }

  // Les médicaments par nom aussi, quand le texte ne ressemble à aucun code.
  if (scanned.kind === "TEXT" && hits.filter((hit) => hit.kind === "DRUG").length === 0) {
    const drugs = await searchDrugCatalog({ pharmacyId, query, limit: 6 });
    for (const result of drugs) hits.push(toDrugHit(result));
  }

  return NextResponse.json({ results: hits.slice(0, 14), unknownCode: scanned.kind === "PRODUCT_UNKNOWN" ? scanned.ean13 : scanned.kind === "DRUG_UNKNOWN" ? scanned.cip13 : null }, { headers: { "Cache-Control": "no-store" } });
}

function toDrugHit(result: Awaited<ReturnType<typeof searchDrugCatalog>>[number]): StockSearchHit {
  return {
    kind: "DRUG",
    id: result.presentationId,
    code: result.cip13,
    label: result.specialtyName,
    detail: result.label,
    priceCents: result.stock?.priceCents ?? result.priceCents ?? null,
    quantity: result.stock ? result.stock.quantity : null,
  };
}

function toProductHit(product: {
  id: string;
  name: string;
  brand: string | null;
  ean: string | null;
  salePriceCents: number;
  stockItem: { quantity: number } | null;
}): StockSearchHit {
  return {
    kind: "PRODUCT",
    id: product.id,
    code: product.ean,
    label: product.name,
    detail: product.brand,
    priceCents: product.salePriceCents,
    quantity: product.stockItem?.quantity ?? 0,
  };
}
