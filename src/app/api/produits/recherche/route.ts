import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { searchPharmacyProducts } from "@/server/services/stock-search";

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

/**
 * Recherche catalogue, utilisée par l'écran de vente pour ajouter un conseil et par « Mes associations ».
 *
 * Tolérante (`core/search/tolerant-search.ts`) : sans accents ni casse, mot par mot, dosage collé à son unité, abréviations
 * du logiciel de gestion — « crème mains » trouve « NEUTROGENA CR MAIN ». Un code lu à la douchette qui désigne exactement
 * un produit ne rend que lui. Toujours bornée à l'officine de la session.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRODUCT_VIEW)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const category = url.searchParams.get("categorie");

  const hits = await searchPharmacyProducts(session.scope.pharmacyId, query, { category, limit: 20 });
  const results: ProductSearchResult[] = hits.map((hit) => ({
    id: hit.id,
    name: hit.name,
    brand: hit.brand,
    category: hit.category,
    reference: hit.reference,
    imageUrl: hit.imageUrl,
    salePriceCents: hit.salePriceCents,
    quantity: hit.quantity,
    status: hit.status,
    claims: hit.claims,
  }));

  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
