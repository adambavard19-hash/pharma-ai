import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { stockStatus } from "@/server/services/catalog";

export type ProductSearchResult = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  reference: string;
  imageUrl: string | null;
  salePriceCents: number;
  quantity: number;
  status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  claims: string[];
};

/** Recherche catalogue, utilisée par l'écran de vente pour ajouter un conseil. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRODUCT_VIEW)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const category = url.searchParams.get("categorie");

  const products = await prisma.product.findMany({
    where: {
      pharmacyId: session.scope.pharmacyId,
      deletedAt: null,
      isActive: true,
      ...(category ? { category: category as never } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { brand: { contains: query, mode: "insensitive" as const } },
              { reference: { contains: query, mode: "insensitive" as const } },
              { ean: { contains: query, mode: "insensitive" as const } },
              { matchingTags: { has: query.toLowerCase() } },
            ],
          }
        : {}),
    },
    include: { stockItem: true },
    orderBy: { name: "asc" },
    take: 20,
  });

  const results: ProductSearchResult[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    reference: product.reference,
    imageUrl: product.imageUrl,
    salePriceCents: product.salePriceCents,
    quantity: product.stockItem?.quantity ?? 0,
    status: stockStatus(
      product.stockItem?.quantity ?? 0,
      product.stockItem?.alertThreshold ?? 0,
    ),
    claims: product.commercialClaims,
  }));

  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
